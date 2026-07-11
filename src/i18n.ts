// UI languages. Covers the app chrome — navigation, section titles,
// buttons, key labels. Deep prose (coaching suggestions, notes) stays
// in English for now and is marked for a native-speaker pass.

export type LangId = 'en' | 'ar' | 'fr' | 'de' | 'es' | 'hi'

export const LANGS: { id: LangId; label: string; dir: 'ltr' | 'rtl' }[] = [
  { id: 'en', label: 'English', dir: 'ltr' },
  { id: 'ar', label: 'العربية', dir: 'rtl' },
  { id: 'fr', label: 'Français', dir: 'ltr' },
  { id: 'de', label: 'Deutsch', dir: 'ltr' },
  { id: 'es', label: 'Español', dir: 'ltr' },
  { id: 'hi', label: 'हिन्दी', dir: 'ltr' },
]

type Dict = Record<string, string>

const EN: Dict = {
  magicLink: 'Email me a login link', forgotPassword: 'Forgot password?', logOutAll: 'Log out everywhere',
  countdown: 'Countdown', today: 'Today', checklist: 'Checklist', growth: 'Growth',
  all: 'All', canvas: 'Canvas', you: 'You',
  daysLeft: 'days left', daysPast: 'days past', gone: 'gone', remains: 'remains',
  started: 'started', ends: 'ends', deadline: 'deadline', day: 'day',
  yourDeadlines: 'Your deadlines', theWall: 'The wall', addDeadline: 'Add deadline',
  spent: 'spent', todayCell: 'today', remaining: 'remaining',
  hours: 'Hours', quarterHours: 'Quarter hours', wholeHoursLeft: 'whole hours left',
  ofTodayGone: 'of today is gone', stillYours: 'still yours', minLeft: '× 15 min left',
  task: 'Task', dayScore: 'Day score', addTask: 'Add task', monthProductivity: 'month productivity',
  thisWeek: 'This week', thisMonth: 'This month', thisYear: 'This year',
  better: 'better', worse: 'worse', steady: 'steady', vsYesterday: 'vs yesterday',
  vsLastWeek: 'vs last week', vsLastMonth: 'vs last month', vsLastYear: 'vs last year',
  yourCurve: 'Your curve', compoundIndex: 'compound index · last 90 days',
  streak: 'Streak', days: 'days', avg30: '30-day avg', productivity: 'productivity',
  totalTicks: 'Total ticks', allTime: 'all time', focus: 'Focus', last30: 'last 30 days',
  weekends: 'Weekends', goingWell: 'Going well', painPoints: 'Pain points',
  whatToImprove: 'What to improve', focusSessions: 'Focus sessions', logged: 'logged',
  progressReport: 'Progress report', downloadPdf: 'Download PDF report', drawing: 'Drawing…',
  lookFeel: 'Look & feel', displayFont: 'Display font', backgroundScene: 'Background scene',
  theme: 'Theme', fontLibrary: 'Font library…', style: 'style', scene: 'scene', font: 'font',
  language: 'Language',
  logIn: 'Log in', createAccount: 'Create account', signUp: 'Sign up', logOut: 'Log out',
  yourAccount: 'Your account', name: 'Name', phone: 'Phone', email: 'Email',
  password: 'Password', memberSince: 'Member since', deleteAccount: 'Delete account',
  save: 'save', everyDayCounts: 'every day counts !',
  last7: 'Last 7 days', last30d: 'Last 30 days', last90: 'Last 90 days', lastYear: 'Last year',
}

const AR: Dict = {
  magicLink: 'أرسل رابط دخول إلى بريدي', forgotPassword: 'نسيت كلمة المرور؟', logOutAll: 'تسجيل الخروج من كل الأجهزة',
  countdown: 'العدّ التنازلي', today: 'اليوم', checklist: 'القائمة', growth: 'النموّ',
  all: 'الكل', canvas: 'اللوحة', you: 'أنت',
  daysLeft: 'يومًا متبقّيًا', daysPast: 'يومًا مضى', gone: 'مضى', remains: 'متبقٍّ',
  started: 'البداية', ends: 'النهاية', deadline: 'الموعد', day: 'يوم',
  yourDeadlines: 'مواعيدك', theWall: 'الجدار', addDeadline: 'أضف موعدًا',
  spent: 'مضى', todayCell: 'اليوم', remaining: 'متبقٍّ',
  hours: 'الساعات', quarterHours: 'أرباع الساعة', wholeHoursLeft: 'ساعة كاملة متبقية',
  ofTodayGone: 'من اليوم مضى', stillYours: 'ما زال لك', minLeft: '× ١٥ دقيقة متبقية',
  task: 'المهمة', dayScore: 'نتيجة اليوم', addTask: 'أضف مهمة', monthProductivity: 'إنتاجية الشهر',
  thisWeek: 'هذا الأسبوع', thisMonth: 'هذا الشهر', thisYear: 'هذه السنة',
  better: 'أفضل', worse: 'أسوأ', steady: 'ثابت', vsYesterday: 'مقارنة بالأمس',
  vsLastWeek: 'مقارنة بالأسبوع الماضي', vsLastMonth: 'مقارنة بالشهر الماضي', vsLastYear: 'مقارنة بالسنة الماضية',
  yourCurve: 'منحناك', compoundIndex: 'مؤشر التراكم · آخر ٩٠ يومًا',
  streak: 'التتابع', days: 'أيام', avg30: 'متوسط ٣٠ يومًا', productivity: 'إنتاجية',
  totalTicks: 'مجموع الإنجازات', allTime: 'منذ البداية', focus: 'التركيز', last30: 'آخر ٣٠ يومًا',
  weekends: 'عطلات الأسبوع', goingWell: 'يسير جيدًا', painPoints: 'نقاط الضعف',
  whatToImprove: 'ما الذي يُحسَّن', focusSessions: 'جلسات التركيز', logged: 'مسجّلة',
  progressReport: 'تقرير التقدم', downloadPdf: 'تنزيل تقرير PDF', drawing: 'جارٍ الرسم…',
  lookFeel: 'المظهر', displayFont: 'خط العرض', backgroundScene: 'خلفية المشهد',
  theme: 'السمة', fontLibrary: 'مكتبة الخطوط…', style: 'المظهر', scene: 'المشهد', font: 'الخط',
  language: 'اللغة',
  logIn: 'تسجيل الدخول', createAccount: 'إنشاء حساب', signUp: 'سجّل', logOut: 'تسجيل الخروج',
  yourAccount: 'حسابك', name: 'الاسم', phone: 'الهاتف', email: 'البريد الإلكتروني',
  password: 'كلمة المرور', memberSince: 'عضو منذ', deleteAccount: 'حذف الحساب',
  save: 'حفظ', everyDayCounts: '! كل يوم له قيمة',
  last7: 'آخر ٧ أيام', last30d: 'آخر ٣٠ يومًا', last90: 'آخر ٩٠ يومًا', lastYear: 'السنة الأخيرة',
}

const FR: Dict = {
  magicLink: 'Recevoir un lien de connexion', forgotPassword: 'Mot de passe oublié ?', logOutAll: 'Se déconnecter partout',
  countdown: 'Compte à rebours', today: "Aujourd'hui", checklist: 'Liste', growth: 'Progrès',
  all: 'Tout', canvas: 'Toile', you: 'Vous',
  daysLeft: 'jours restants', daysPast: 'jours passés', gone: 'écoulé', remains: 'restant',
  started: 'début', ends: 'fin', deadline: 'échéance', day: 'jour',
  yourDeadlines: 'Vos échéances', theWall: 'Le mur', addDeadline: 'Ajouter une échéance',
  spent: 'écoulé', todayCell: "aujourd'hui", remaining: 'restant',
  hours: 'Heures', quarterHours: "Quarts d'heure", wholeHoursLeft: 'heures entières restantes',
  ofTodayGone: 'de la journée écoulée', stillYours: 'encore à vous', minLeft: '× 15 min restantes',
  task: 'Tâche', dayScore: 'Score du jour', addTask: 'Ajouter une tâche', monthProductivity: 'productivité du mois',
  thisWeek: 'Cette semaine', thisMonth: 'Ce mois-ci', thisYear: 'Cette année',
  better: 'mieux', worse: 'moins bien', steady: 'stable', vsYesterday: "vs hier",
  vsLastWeek: 'vs la semaine dernière', vsLastMonth: 'vs le mois dernier', vsLastYear: "vs l'année dernière",
  yourCurve: 'Votre courbe', compoundIndex: 'indice composé · 90 derniers jours',
  streak: 'Série', days: 'jours', avg30: 'moyenne 30 j', productivity: 'productivité',
  totalTicks: 'Total coché', allTime: 'depuis le début', focus: 'Concentration', last30: '30 derniers jours',
  weekends: 'Week-ends', goingWell: 'Ça va bien', painPoints: 'Points faibles',
  whatToImprove: 'À améliorer', focusSessions: 'Sessions de concentration', logged: 'enregistrées',
  progressReport: 'Rapport de progrès', downloadPdf: 'Télécharger le PDF', drawing: 'Création…',
  lookFeel: 'Apparence', displayFont: "Police d'affichage", backgroundScene: 'Scène de fond',
  theme: 'Thème', fontLibrary: 'Bibliothèque de polices…', style: 'style', scene: 'scène', font: 'police',
  language: 'Langue',
  logIn: 'Se connecter', createAccount: 'Créer un compte', signUp: "S'inscrire", logOut: 'Se déconnecter',
  yourAccount: 'Votre compte', name: 'Nom', phone: 'Téléphone', email: 'E-mail',
  password: 'Mot de passe', memberSince: 'Membre depuis', deleteAccount: 'Supprimer le compte',
  save: 'enregistrer', everyDayCounts: 'chaque jour compte !',
  last7: '7 derniers jours', last30d: '30 derniers jours', last90: '90 derniers jours', lastYear: 'Dernière année',
}

const DE: Dict = {
  magicLink: 'Login-Link per E-Mail', forgotPassword: 'Passwort vergessen?', logOutAll: 'Überall abmelden',
  countdown: 'Countdown', today: 'Heute', checklist: 'Checkliste', growth: 'Wachstum',
  all: 'Alles', canvas: 'Leinwand', you: 'Du',
  daysLeft: 'Tage übrig', daysPast: 'Tage vorbei', gone: 'vorbei', remains: 'übrig',
  started: 'Beginn', ends: 'Ende', deadline: 'Frist', day: 'Tag',
  yourDeadlines: 'Deine Fristen', theWall: 'Die Wand', addDeadline: 'Frist hinzufügen',
  spent: 'vorbei', todayCell: 'heute', remaining: 'übrig',
  hours: 'Stunden', quarterHours: 'Viertelstunden', wholeHoursLeft: 'ganze Stunden übrig',
  ofTodayGone: 'des Tages vorbei', stillYours: 'gehören noch dir', minLeft: '× 15 Min übrig',
  task: 'Aufgabe', dayScore: 'Tageswert', addTask: 'Aufgabe hinzufügen', monthProductivity: 'Monatsproduktivität',
  thisWeek: 'Diese Woche', thisMonth: 'Dieser Monat', thisYear: 'Dieses Jahr',
  better: 'besser', worse: 'schlechter', steady: 'stabil', vsYesterday: 'ggü. gestern',
  vsLastWeek: 'ggü. letzter Woche', vsLastMonth: 'ggü. letztem Monat', vsLastYear: 'ggü. letztem Jahr',
  yourCurve: 'Deine Kurve', compoundIndex: 'Zinseszins-Index · letzte 90 Tage',
  streak: 'Serie', days: 'Tage', avg30: '30-Tage-Schnitt', productivity: 'Produktivität',
  totalTicks: 'Erledigt gesamt', allTime: 'insgesamt', focus: 'Fokus', last30: 'letzte 30 Tage',
  weekends: 'Wochenenden', goingWell: 'Läuft gut', painPoints: 'Schwachstellen',
  whatToImprove: 'Zu verbessern', focusSessions: 'Fokus-Sitzungen', logged: 'erfasst',
  progressReport: 'Fortschrittsbericht', downloadPdf: 'PDF herunterladen', drawing: 'Wird erstellt…',
  lookFeel: 'Erscheinungsbild', displayFont: 'Schriftart', backgroundScene: 'Hintergrund',
  theme: 'Thema', fontLibrary: 'Schriftbibliothek…', style: 'Stil', scene: 'Szene', font: 'Schrift',
  language: 'Sprache',
  logIn: 'Anmelden', createAccount: 'Konto erstellen', signUp: 'Registrieren', logOut: 'Abmelden',
  yourAccount: 'Dein Konto', name: 'Name', phone: 'Telefon', email: 'E-Mail',
  password: 'Passwort', memberSince: 'Mitglied seit', deleteAccount: 'Konto löschen',
  save: 'speichern', everyDayCounts: 'jeder Tag zählt !',
  last7: 'Letzte 7 Tage', last30d: 'Letzte 30 Tage', last90: 'Letzte 90 Tage', lastYear: 'Letztes Jahr',
}

const ES: Dict = {
  magicLink: 'Enviarme un enlace de acceso', forgotPassword: '¿Olvidaste tu contraseña?', logOutAll: 'Cerrar sesión en todas partes',
  countdown: 'Cuenta atrás', today: 'Hoy', checklist: 'Lista', growth: 'Crecimiento',
  all: 'Todo', canvas: 'Lienzo', you: 'Tú',
  daysLeft: 'días restantes', daysPast: 'días pasados', gone: 'pasado', remains: 'queda',
  started: 'inicio', ends: 'fin', deadline: 'fecha límite', day: 'día',
  yourDeadlines: 'Tus fechas límite', theWall: 'El muro', addDeadline: 'Añadir fecha',
  spent: 'pasado', todayCell: 'hoy', remaining: 'restante',
  hours: 'Horas', quarterHours: 'Cuartos de hora', wholeHoursLeft: 'horas enteras restantes',
  ofTodayGone: 'del día ha pasado', stillYours: 'aún es tuyo', minLeft: '× 15 min restantes',
  task: 'Tarea', dayScore: 'Puntuación del día', addTask: 'Añadir tarea', monthProductivity: 'productividad del mes',
  thisWeek: 'Esta semana', thisMonth: 'Este mes', thisYear: 'Este año',
  better: 'mejor', worse: 'peor', steady: 'estable', vsYesterday: 'vs ayer',
  vsLastWeek: 'vs la semana pasada', vsLastMonth: 'vs el mes pasado', vsLastYear: 'vs el año pasado',
  yourCurve: 'Tu curva', compoundIndex: 'índice compuesto · últimos 90 días',
  streak: 'Racha', days: 'días', avg30: 'media 30 días', productivity: 'productividad',
  totalTicks: 'Total completado', allTime: 'desde el inicio', focus: 'Enfoque', last30: 'últimos 30 días',
  weekends: 'Fines de semana', goingWell: 'Va bien', painPoints: 'Puntos débiles',
  whatToImprove: 'Qué mejorar', focusSessions: 'Sesiones de enfoque', logged: 'registradas',
  progressReport: 'Informe de progreso', downloadPdf: 'Descargar PDF', drawing: 'Creando…',
  lookFeel: 'Apariencia', displayFont: 'Tipografía', backgroundScene: 'Escena de fondo',
  theme: 'Tema', fontLibrary: 'Biblioteca de fuentes…', style: 'estilo', scene: 'escena', font: 'fuente',
  language: 'Idioma',
  logIn: 'Iniciar sesión', createAccount: 'Crear cuenta', signUp: 'Registrarse', logOut: 'Cerrar sesión',
  yourAccount: 'Tu cuenta', name: 'Nombre', phone: 'Teléfono', email: 'Correo',
  password: 'Contraseña', memberSince: 'Miembro desde', deleteAccount: 'Eliminar cuenta',
  save: 'guardar', everyDayCounts: '¡ cada día cuenta !',
  last7: 'Últimos 7 días', last30d: 'Últimos 30 días', last90: 'Últimos 90 días', lastYear: 'Último año',
}

const HI: Dict = {
  magicLink: 'लॉगिन लिंक ईमेल करें', forgotPassword: 'पासवर्ड भूल गए?', logOutAll: 'सभी डिवाइस से लॉग आउट',
  countdown: 'उलटी गिनती', today: 'आज', checklist: 'चेकलिस्ट', growth: 'वृद्धि',
  all: 'सब', canvas: 'कैनवास', you: 'आप',
  daysLeft: 'दिन बाक़ी', daysPast: 'दिन बीते', gone: 'बीत गया', remains: 'बाक़ी',
  started: 'शुरुआत', ends: 'समाप्ति', deadline: 'अंतिम तिथि', day: 'दिन',
  yourDeadlines: 'आपकी समय-सीमाएँ', theWall: 'दीवार', addDeadline: 'समय-सीमा जोड़ें',
  spent: 'बीत गया', todayCell: 'आज', remaining: 'बाक़ी',
  hours: 'घंटे', quarterHours: 'पंद्रह मिनट के खंड', wholeHoursLeft: 'पूरे घंटे बाक़ी',
  ofTodayGone: 'दिन बीत चुका', stillYours: 'अब भी आपका है', minLeft: '× 15 मिनट बाक़ी',
  task: 'कार्य', dayScore: 'दिन का स्कोर', addTask: 'कार्य जोड़ें', monthProductivity: 'महीने की उत्पादकता',
  thisWeek: 'इस सप्ताह', thisMonth: 'इस महीने', thisYear: 'इस वर्ष',
  better: 'बेहतर', worse: 'कमज़ोर', steady: 'स्थिर', vsYesterday: 'कल की तुलना में',
  vsLastWeek: 'पिछले सप्ताह की तुलना में', vsLastMonth: 'पिछले महीने की तुलना में', vsLastYear: 'पिछले वर्ष की तुलना में',
  yourCurve: 'आपका वक्र', compoundIndex: 'चक्रवृद्धि सूचकांक · पिछले 90 दिन',
  streak: 'सिलसिला', days: 'दिन', avg30: '30-दिन औसत', productivity: 'उत्पादकता',
  totalTicks: 'कुल पूर्ण', allTime: 'अब तक', focus: 'फ़ोकस', last30: 'पिछले 30 दिन',
  weekends: 'सप्ताहांत', goingWell: 'अच्छा चल रहा है', painPoints: 'कमज़ोरियाँ',
  whatToImprove: 'क्या सुधारें', focusSessions: 'फ़ोकस सत्र', logged: 'दर्ज',
  progressReport: 'प्रगति रिपोर्ट', downloadPdf: 'PDF डाउनलोड करें', drawing: 'बन रही है…',
  lookFeel: 'रूप-रंग', displayFont: 'फ़ॉन्ट', backgroundScene: 'पृष्ठभूमि दृश्य',
  theme: 'थीम', fontLibrary: 'फ़ॉन्ट पुस्तकालय…', style: 'स्टाइल', scene: 'दृश्य', font: 'फ़ॉन्ट',
  language: 'भाषा',
  logIn: 'लॉग इन', createAccount: 'खाता बनाएँ', signUp: 'साइन अप', logOut: 'लॉग आउट',
  yourAccount: 'आपका खाता', name: 'नाम', phone: 'फ़ोन', email: 'ईमेल',
  password: 'पासवर्ड', memberSince: 'सदस्य कब से', deleteAccount: 'खाता हटाएँ',
  save: 'सहेजें', everyDayCounts: 'हर दिन मायने रखता है !',
  last7: 'पिछले 7 दिन', last30d: 'पिछले 30 दिन', last90: 'पिछले 90 दिन', lastYear: 'पिछला वर्ष',
}

const DICTS: Record<LangId, Dict> = { en: EN, ar: AR, fr: FR, de: DE, es: ES, hi: HI }

let current: LangId = 'en'

/** Set the active language for t(). Safe to call during render;
 *  DOM attributes (lang/dir) are applied separately in an effect. */
export function applyLang(lang: LangId): void {
  current = lang
}

export function langDir(lang: LangId): 'ltr' | 'rtl' {
  return LANGS.find((l) => l.id === lang)?.dir ?? 'ltr'
}

/** Translate a key in the active language, falling back to English. */
export function t(key: string): string {
  return DICTS[current][key] ?? EN[key] ?? key
}
