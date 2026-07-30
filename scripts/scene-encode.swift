// Re-encode a background video scene for public/scenes/ — fixed bitrate, no
// audio track, and the tail cross-dissolved into the head so the clip loops
// without a visible jump. Uses only AVFoundation/VideoToolbox, so it needs no
// ffmpeg (macOS ships everything required).
//
//   swiftc -O scripts/scene-encode.swift -o /tmp/scene-encode
//   /tmp/scene-encode raw/beach.mp4 public/scenes/beach.mp4 900 1.0
//
// Bitrate guide for 720p behind the scrim: 900 kbps for calm/dark scenes,
// 1200 for medium detail, 1500 for busy street scenes. See docs/video-scenes.md.
//
// out(t) = crossfade(tail(t), head(t)) for t in [0, X)   -- tail fades out
//        = src(t)                      for t in [X, D-X)
// Output length L = D - X, so out(L) ≈ out(0): seamless.
//
// usage: loopenc <in> <out> <kbps> <crossfadeSeconds>

import AVFoundation
import Foundation

let a = CommandLine.arguments
guard a.count >= 5,
      let kbps = Int(a[3]), let xfade = Double(a[4]) else {
    print("usage: loopenc <in> <out> <kbps> <crossfadeSeconds>"); exit(2)
}
let srcURL = URL(fileURLWithPath: a[1])
let outURL = URL(fileURLWithPath: a[2])
try? FileManager.default.removeItem(at: outURL)

let asset = AVURLAsset(url: srcURL)
guard let srcTrack = asset.tracks(withMediaType: .video).first else { print("ERR no video"); exit(1) }
let D = CMTimeGetSeconds(asset.duration)
let X = min(xfade, D / 3)
let L = D - X
let fps = srcTrack.nominalFrameRate > 0 ? Double(srcTrack.nominalFrameRate) : 30
let natural = srcTrack.naturalSize.applying(srcTrack.preferredTransform)
let size = CGSize(width: abs(natural.width), height: abs(natural.height))
let scale: Int32 = 600

func t(_ s: Double) -> CMTime { CMTime(seconds: s, preferredTimescale: scale) }

// ---- composition: A = body [0, L] at 0 ; B = tail [L, D] at 0 (on top) ----
let comp = AVMutableComposition()
guard let trackA = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
      let trackB = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
else { print("ERR tracks"); exit(1) }
do {
    try trackA.insertTimeRange(CMTimeRange(start: .zero, duration: t(L)), of: srcTrack, at: .zero)
    try trackB.insertTimeRange(CMTimeRange(start: t(L), duration: t(X)), of: srcTrack, at: .zero)
} catch { print("ERR insert \(error)"); exit(1) }
trackA.preferredTransform = srcTrack.preferredTransform
trackB.preferredTransform = srcTrack.preferredTransform

let vc = AVMutableVideoComposition()
vc.renderSize = size
vc.frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps.rounded()))

// [0, X): B on top fading 1 -> 0 over A
let iFade = AVMutableVideoCompositionInstruction()
iFade.timeRange = CMTimeRange(start: .zero, duration: t(X))
let lB = AVMutableVideoCompositionLayerInstruction(assetTrack: trackB)
lB.setOpacityRamp(fromStartOpacity: 1.0, toEndOpacity: 0.0,
                  timeRange: CMTimeRange(start: .zero, duration: t(X)))
let lA0 = AVMutableVideoCompositionLayerInstruction(assetTrack: trackA)
lA0.setOpacity(1.0, at: .zero)
iFade.layerInstructions = [lB, lA0]   // first = topmost

// [X, L): A only
let iRest = AVMutableVideoCompositionInstruction()
iRest.timeRange = CMTimeRange(start: t(X), duration: t(L - X))
let lA1 = AVMutableVideoCompositionLayerInstruction(assetTrack: trackA)
lA1.setOpacity(1.0, at: .zero)
iRest.layerInstructions = [lA1]

vc.instructions = [iFade, iRest]

// ---- reader ----
guard let reader = try? AVAssetReader(asset: comp) else { print("ERR reader"); exit(1) }
let rOut = AVAssetReaderVideoCompositionOutput(
    videoTracks: comp.tracks(withMediaType: .video),
    videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
rOut.videoComposition = vc
rOut.alwaysCopiesSampleData = false
guard reader.canAdd(rOut) else { print("ERR canAdd out"); exit(1) }
reader.add(rOut)

// ---- writer: H.264, video only (audio simply never added) ----
guard let writer = try? AVAssetWriter(outputURL: outURL, fileType: .mp4) else { print("ERR writer"); exit(1) }
writer.shouldOptimizeForNetworkUse = true      // faststart
let wIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: Int(size.width),
    AVVideoHeightKey: Int(size.height),
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: kbps * 1000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264MainAutoLevel,
        AVVideoMaxKeyFrameIntervalKey: Int(fps.rounded()) * 2,
        AVVideoAllowFrameReorderingKey: true,
        AVVideoExpectedSourceFrameRateKey: Int(fps.rounded()),
    ],
])
wIn.expectsMediaDataInRealTime = false
guard writer.canAdd(wIn) else { print("ERR canAdd in"); exit(1) }
writer.add(wIn)

guard reader.startReading() else { print("ERR startReading \(reader.error as Any)"); exit(1) }
guard writer.startWriting() else { print("ERR startWriting \(writer.error as Any)"); exit(1) }
writer.startSession(atSourceTime: .zero)

let q = DispatchQueue(label: "enc")
let sem = DispatchSemaphore(value: 0)
var frames = 0
wIn.requestMediaDataWhenReady(on: q) {
    while wIn.isReadyForMoreMediaData {
        guard reader.status == .reading, let sb = rOut.copyNextSampleBuffer() else {
            wIn.markAsFinished()
            writer.finishWriting { sem.signal() }
            return
        }
        if wIn.append(sb) { frames += 1 } else {
            wIn.markAsFinished(); writer.finishWriting { sem.signal() }; return
        }
    }
}
sem.wait()

if writer.status == .failed {
    print("ERR write failed: \(writer.error as Any)"); exit(1)
}
print("OK frames=\(frames) srcDur=\(String(format: "%.2f", D)) outDur=\(String(format: "%.2f", L)) xfade=\(String(format: "%.2f", X))")
