export type SupportedLanguage = 'en' | 'ru' | 'es' | 'zh' | 'hi' | 'ar' | 'pt' | 'fr' | 'ja' | 'de';

export interface LanguageMeta {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
  direction: 'ltr' | 'rtl';
}

export const LANGUAGES: LanguageMeta[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', direction: 'ltr' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', direction: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', direction: 'ltr' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', direction: 'ltr' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', direction: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', direction: 'rtl' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷', direction: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', direction: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', direction: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', direction: 'ltr' },
];

export interface TranslationStrings {
  // Navigation
  appName: string;
  tagline: string;
  explore: string;
  artists: string;
  friendModeration: string;
  reputation: string;
  instagram: string;
  cryptocloud: string;
  analytics: string;
  bookNow: string;
  consultation: string;
  switchRoleClient: string;
  switchRoleMaster: string;
  installApp: string;
  androidBuild: string;
  permissionsTitle: string;

  // Hero
  heroBadge: string;
  heroTitle1: string;
  heroTitle2: string;
  heroTitle3: string;
  heroSubtitle: string;
  exploreCollection: string;
  bookSession: string;
  liveSwarmP2P: string;

  // Gallery
  galleryTitle: string;
  gallerySubtitle: string;
  allCategories: string;
  bookThisLook: string;
  publicArtNote: string;

  // Moderation
  moderationTitle: string;
  moderationSubtitle: string;
  inviteFriends: string;
  activeCases: string;
  voteAuthentic: string;
  voteFlag: string;
  friendsQuorum: string;
  juryEarnReward: string;

  // Permissions
  cameraPerm: string;
  notifyPerm: string;
  geoPerm: string;
  storagePerm: string;
  grantAll: string;
  permGranted: string;
  permDenied: string;
  permPrompt: string;

  // Checkout
  checkoutTitle: string;
  smartContractEscrow: string;
  payWithCrypto: string;
  payWithFiat: string;
  tipArtist: string;
  confirmPayment: string;
  escrowSecured: string;

  // Chat
  e2eEncryptedChat: string;
  typeMessage: string;
  sendQuote: string;

  // Map & Monetization & Themes
  salonMap?: string;
  themeToggle?: string;
  sponsorAd?: string;
}

export const TRANSLATIONS: Record<SupportedLanguage, TranslationStrings> = {
  en: {
    appName: 'Nailix',
    tagline: 'Haute Manicure Art Network',
    explore: 'Art Gallery',
    artists: 'Masters',
    friendModeration: 'Friend Jury [SIM]',
    reputation: 'Reputation Ledger [SIM]',
    instagram: 'Insta Demo [SIM]',
    cryptocloud: 'Peer Sync [SIM]',
    analytics: 'Analytics [LOCAL]',
    bookNow: 'Book Session',
    consultation: 'Studio Chat [SIM]',
    switchRoleClient: 'Client Mode',
    switchRoleMaster: 'Master Mode',
    installApp: 'Install Android PWA',
    androidBuild: 'Android PWA / Local APK',
    permissionsTitle: 'Device Permissions',

    heroBadge: 'EXQUISITE NAIL COUTURE · LUXURY ORNAMENTS · ARTISAN ATELIER',
    heroTitle1: 'Radiant Luminous Pigments.',
    heroTitle2: 'Intricate Filigree Ornaments.',
    heroTitle3: 'Haute Manicure Couture.',
    heroSubtitle: 'Curated manicure art showcase with Cyber-Gaudí aesthetics, salon distance radar, and RFC 5545 calendar export — paired with [SIM] interactive previews for concierge chat, peer jury, and multi-currency deposit flows.',
    exploreCollection: 'Explore Master Collection',
    bookSession: 'Book Master Slot',
    liveSwarmP2P: 'Local Broadcast Sync [SIM]',

    galleryTitle: 'Public Haute Couture Gallery',
    gallerySubtitle: 'Curated nail art looks bundled locally for instant offline browsing and direct studio booking.',
    allCategories: 'All Aesthetics',
    bookThisLook: 'Book This Sculptural Look',
    publicArtNote: 'Public Curated Showcase · Local Assets',

    moderationTitle: 'Friend Circle Moderation Preview [SIM]',
    moderationSubtitle: 'Interactive local state prototype [SIM]: vote on sample craft disputes and see quorum rules in action before multi-user networking in Stage 5.',
    inviteFriends: 'Add Reviewer to Session [SIM]',
    activeCases: 'Sample Cases in Session [SIM]',
    voteAuthentic: 'Approve Sample Craft (Vouch) [SIM]',
    voteFlag: 'Flag Sample Violation [SIM]',
    friendsQuorum: 'Simulated Quorum: 3 of 5 needed [SIM]',
    juryEarnReward: 'Demo Score: +25 Taste Points [SIM]',

    cameraPerm: 'Camera & Macro Lens (Live nail check & reference scan)',
    notifyPerm: 'Push Notifications (Browser notification preview for reminders)',
    geoPerm: 'Geolocation (Find nearest curated master salons)',
    storagePerm: 'Local Gallery Cache (Instant offline artwork loading)',
    grantAll: 'Grant All Permissions',
    permGranted: 'Granted',
    permDenied: 'Denied',
    permPrompt: 'Requesting...',

    checkoutTitle: 'Demo Multi-Currency Checkout [SIM]',
    smartContractEscrow: 'Simulated Deposit Hold Preview [SIM]',
    payWithCrypto: 'Demo Token Preview (USDC, ETH, SOL, $NAIL) [SIM]',
    payWithFiat: 'Demo Card / Fiat Preview (USD, EUR, GBP) [SIM]',
    tipArtist: 'Master Gratuity',
    confirmPayment: 'Confirm Demo Booking [SIM]',
    escrowSecured: 'Demo Hold Recorded in Session [SIM]',

    e2eEncryptedChat: 'Studio Concierge Chat Preview [SIM]',
    typeMessage: 'Type message...',
    sendQuote: 'Send Demo Quote [SIM]',

    salonMap: 'Map & Proximity',
    themeToggle: 'Theme',
    sponsorAd: 'Sponsored Deals',
  },

  ru: {
    appName: 'Nailix',
    tagline: 'Арт-Сеть Высокого Маникюра',
    explore: 'Арт-Галерея',
    artists: 'Мастера',
    friendModeration: 'Жюри Друзей [SIM]',
    reputation: 'Реестр Отзывов [SIM]',
    instagram: 'Инста Демо [SIM]',
    cryptocloud: 'Пир-Синк [SIM]',
    analytics: 'Аналитика [LOCAL]',
    bookNow: 'Записаться',
    consultation: 'Чат Ателье [SIM]',
    switchRoleClient: 'Режим Клиента',
    switchRoleMaster: 'Режим Мастера',
    installApp: 'Установить PWA',
    androidBuild: 'PWA и локальный APK',
    permissionsTitle: 'Разрешения Устройства',

    heroBadge: 'HAUTE COUTURE · АВТОРСКИЕ ОРНАМЕНТЫ · ЭЛИТНЫЕ АТЕЛЬЕ',
    heroTitle1: 'Сияющие Глубокие Пигменты.',
    heroTitle2: 'Изысканные Узоры и Орнаменты.',
    heroTitle3: 'Высокое Искусство Маникюра.',
    heroSubtitle: 'Витрина авторского маникюра в эстетике Cyber-Gaudí с картой студий и экспортом в календарь RFC 5545, дополненная [SIM]-прототипами чата с ателье, круга жюри и демо-оплаты.',
    exploreCollection: 'Смотреть Коллекцию Узоров',
    bookSession: 'Забронировать Слот',
    liveSwarmP2P: 'Локальный Broadcast Симулятор [SIM]',

    galleryTitle: 'Публичная Кутюрная Галерея',
    gallerySubtitle: 'Локальная коллекция работ мастеров для быстрого просмотра оффлайн и прямой записи на дизайн.',
    allCategories: 'Все Стилистики',
    bookThisLook: 'Записаться на Этот Дизайн',
    publicArtNote: 'Открытая Витрина · Локальные Ассеты',

    moderationTitle: 'Прототип Модерации Кругом Друзей [SIM]',
    moderationSubtitle: 'Интерактивная локальная симуляция [SIM]: голосование по демо-кейсам качества работ в памяти текущей сессии до Этапа 5.',
    inviteFriends: 'Добавить арбитра в сессию [SIM]',
    activeCases: 'Демо-кейсы на проверке [SIM]',
    voteAuthentic: 'Подтвердить ручную работу [SIM]',
    voteFlag: 'Отметить нарушение [SIM]',
    friendsQuorum: 'Симуляция кворума: 3 из 5 [SIM]',
    juryEarnReward: 'Демо-балл: +25 очков вкуса [SIM]',

    cameraPerm: 'Камера (Фотосъёмка ногтей и сканирование референсов)',
    notifyPerm: 'Уведомления (Локальные браузерные превью напоминаний)',
    geoPerm: 'Геолокация (Поиск ближайших студий на карте)',
    storagePerm: 'Локальное Хранилище (Оффлайн-кеш галереи)',
    grantAll: 'Предоставить Все Разрешения',
    permGranted: 'Разрешено',
    permDenied: 'Запрещено',
    permPrompt: 'Запрос...',

    checkoutTitle: 'Демо-Оплата Бронирования [SIM]',
    smartContractEscrow: 'Симуляция Депозита Сессии [SIM]',
    payWithCrypto: 'Демо-токен превью (USDC, ETH, SOL, $NAIL) [SIM]',
    payWithFiat: 'Демо-карта / Фиат превью (USD, EUR, GBP) [SIM]',
    tipArtist: 'Чаевые Мастеру',
    confirmPayment: 'Подтвердить Демо-Бронь [SIM]',
    escrowSecured: 'Демо-бронь сохранена в сессии [SIM]',

    e2eEncryptedChat: 'Демо-Чат с Консьержем Ателье [SIM]',
    typeMessage: 'Напишите сообщение...',
    sendQuote: 'Отправить Демо-Смету [SIM]',

    salonMap: 'Карта Салонов и Близость',
    themeToggle: 'Тема Оформления',
    sponsorAd: 'Спонсорская Реклама',
  },

  es: {
    appName: 'Nailix',
    tagline: 'Red de Arte de Manicura de Alta Costura',
    explore: 'Galería de Arte',
    artists: 'Maestros',
    friendModeration: 'Jurado [SIM]',
    reputation: 'Registro [SIM]',
    instagram: 'Insta Demo [SIM]',
    cryptocloud: 'Sincronía Local [SIM]',
    analytics: 'Analítica [LOCAL]',
    bookNow: 'Reservar Cita',
    consultation: 'Chat Estudio [SIM]',
    switchRoleClient: 'Modo Cliente',
    switchRoleMaster: 'Modo Maestro',
    installApp: 'Instalar PWA',
    androidBuild: 'PWA / APK Local',
    permissionsTitle: 'Permisos del Dispositivo',

    heroBadge: 'ALTA COSTURA · ORNAMENTOS EXQUISITOS · ATELIER ARTESANAL',
    heroTitle1: 'Pigmentos Luminosos Radiantes.',
    heroTitle2: 'Patrones y Filigranas.',
    heroTitle3: 'Manicura de Alta Costura.',
    heroSubtitle: 'Vitrina de manicura de autor con radar de salones y exportación RFC 5545 al calendario, junto con vistas previas interactivas [SIM] de chat, jurado y pago de demostración.',
    exploreCollection: 'Explorar Colección',
    bookSession: 'Reservar Maestro',
    liveSwarmP2P: 'Sincronización Local [SIM]',

    galleryTitle: 'Galería Pública de Alta Costura',
    gallerySubtitle: 'Obras locales de manicura de alta resolución listas para navegación sin conexión y reserva directa.',
    allCategories: 'Todas las Estéticas',
    bookThisLook: 'Reservar este Diseño',
    publicArtNote: 'Galería Pública · Recursos Locales',

    moderationTitle: 'Vista Previa de Jurado de Amigos [SIM]',
    moderationSubtitle: 'Prototipo interactivo local [SIM]: vota casos de muestra en memoria de sesión para probar el flujo de quórum.',
    inviteFriends: 'Invitar Revisor Demo [SIM]',
    activeCases: 'Casos de Muestra [SIM]',
    voteAuthentic: 'Validar Muestra [SIM]',
    voteFlag: 'Marcar Infracción [SIM]',
    friendsQuorum: 'Quórum Simulado: 3 de 5 [SIM]',
    juryEarnReward: 'Puntos Demo: +25 Score [SIM]',

    cameraPerm: 'Cámara (Fotos de manicura y escaneo de referencias)',
    notifyPerm: 'Notificaciones Push (Vista previa en navegador)',
    geoPerm: 'Geolocalización (Buscar salones cercanos en el mapa)',
    storagePerm: 'Almacenamiento Local (Carga rápida offline de la galería)',
    grantAll: 'Conceder Todos los Permisos',
    permGranted: 'Concedido',
    permDenied: 'Denegado',
    permPrompt: 'Solicitando...',

    checkoutTitle: 'Pago de Demostración [SIM]',
    smartContractEscrow: 'Retención de Depósito Simulada [SIM]',
    payWithCrypto: 'Vista Previa Token Demo (USDC, ETH, SOL, $NAIL) [SIM]',
    payWithFiat: 'Vista Previa Tarjeta Demo (EUR, USD, GBP) [SIM]',
    tipArtist: 'Propina al Maestro',
    confirmPayment: 'Confirmar Reserva Demo [SIM]',
    escrowSecured: 'Reserva Demo Guardada en Sesión [SIM]',

    e2eEncryptedChat: 'Vista Previa de Chat con el Estudio [SIM]',
    typeMessage: 'Escribe un mensaje...',
    sendQuote: 'Enviar Presupuesto Demo [SIM]',
  },

  zh: {
    appName: 'Nailix',
    tagline: '高定美甲艺术展示平台',
    explore: '艺术画廊',
    artists: '大师名录',
    friendModeration: '评审演示 [SIM]',
    reputation: '口碑台账 [SIM]',
    instagram: 'Ins演示 [SIM]',
    cryptocloud: '本地同步 [SIM]',
    analytics: '本地分析 [LOCAL]',
    bookNow: '立即预约',
    consultation: '沙龙对话 [SIM]',
    switchRoleClient: '顾客模式',
    switchRoleMaster: '大师模式',
    installApp: '安装 PWA 应用',
    androidBuild: 'Android PWA / 本地 APK',
    permissionsTitle: '设备权限管理',

    heroBadge: '高级定制 · 华丽纹饰 · 大师工坊',
    heroTitle1: '璀璨流光矿物笔触。',
    heroTitle2: '精致华丽雕花纹饰。',
    heroTitle3: '殿堂级定制美甲。',
    heroSubtitle: '融合高迪美学与沙龙距离雷达的高定美甲展厅，支持 RFC 5545 日历导出，并提供私信对话、好友评审与多币种结算交互原型 [SIM]。',
    exploreCollection: '浏览灵感系列',
    bookSession: '预约大师时段',
    liveSwarmP2P: '本地广播模拟 [SIM]',

    galleryTitle: '公开高级美甲画廊',
    gallerySubtitle: '内置本地高清美甲作品集，支持离线浏览并直接跳转预约同款。',
    allCategories: '所有美学风格',
    bookThisLook: '预约同款造型',
    publicArtNote: '公开作品展示 · 本地资源',

    moderationTitle: '好友协同审核演示 [SIM]',
    moderationSubtitle: '本地状态交互原型 [SIM]：在当前浏览器会话中体验争议作品投票与法定人数规则。',
    inviteFriends: '添加演示评审 [SIM]',
    activeCases: '会话示例案件 [SIM]',
    voteAuthentic: '认可手工样本 [SIM]',
    voteFlag: '标记违规样本 [SIM]',
    friendsQuorum: '模拟法定人数：需 3/5 票 [SIM]',
    juryEarnReward: '演示积分：+25 分 [SIM]',

    cameraPerm: '相机权限（拍摄美甲参考图与现场核验）',
    notifyPerm: '系统推送通知（浏览器本地预约提醒预览）',
    geoPerm: '地理位置（定位附近合作美甲沙龙）',
    storagePerm: '本地缓存（离线极速加载高画质图集）',
    grantAll: '一键授权所有权限',
    permGranted: '已授权',
    permDenied: '已拒绝',
    permPrompt: '请求中...',

    checkoutTitle: '多币种结算演示 [SIM]',
    smartContractEscrow: '模拟押金托管流程 [SIM]',
    payWithCrypto: '代币支付预览 (USDC, ETH, SOL, $NAIL) [SIM]',
    payWithFiat: '银行卡支付预览 (USD, EUR, GBP) [SIM]',
    tipArtist: '大师打赏',
    confirmPayment: '确认演示预约 [SIM]',
    escrowSecured: '已在当前会话记录演示预约 [SIM]',

    e2eEncryptedChat: '沙龙顾问对话演示 [SIM]',
    typeMessage: '输入消息...',
    sendQuote: '发送演示报价 [SIM]',
  },

  hi: {
    appName: 'Nailix',
    tagline: 'हॉट कॉउचर मैनीक्योर आर्ट नेटवर्क',
    explore: 'कला दीर्घा',
    artists: 'मास्टर्स',
    friendModeration: 'मित्र जूरी [SIM]',
    reputation: 'प्रतिष्ठा बही [SIM]',
    instagram: 'इंस्टा डेमो [SIM]',
    cryptocloud: 'लोकल सिंक [SIM]',
    analytics: 'एनालिटिक्स [LOCAL]',
    bookNow: 'बुक करें',
    consultation: 'स्टूडियो चैट [SIM]',
    switchRoleClient: 'ग्राहक मोड',
    switchRoleMaster: 'मास्टर मोड',
    installApp: 'PWA इंस्टॉल करें',
    androidBuild: 'PWA / लोकल APK',
    permissionsTitle: 'डिवाइस अनुमतियाँ',

    heroBadge: 'हॉट कॉउचर · उत्कृष्ट आभूषण · आर्टिसन स्टूडियो',
    heroTitle1: 'दीप्तिमान खनिज पिगमेंट।',
    heroTitle2: 'जटिल नक्काशीदार पैटर्न।',
    heroTitle3: 'हॉट कॉउचर मैनीक्योर।',
    heroSubtitle: 'सैलून दूरी रडार और RFC 5545 कैलेंडर एक्सपोर्ट के साथ क्यूरेटेड मैनीक्योर आर्ट शोकेस — साथ में चैट, जूरी और चेकआउट के [SIM] इंटरैक्टिव प्रीव्यू।',
    exploreCollection: 'कलेक्शन देखें',
    bookSession: 'स्लॉट बुक करें',
    liveSwarmP2P: 'लोकल सिंक सिम्युलेटर [SIM]',

    galleryTitle: 'सार्वजनिक हॉट कॉउचर गैलरी',
    gallerySubtitle: 'त्वरित ऑफ़लाइन ब्राउज़िंग और सीधी बुकिंग के लिए स्थानीय रूप से बंडल की गई नेल आर्ट।',
    allCategories: 'सभी शैलियाँ',
    bookThisLook: 'यह लुक बुक करें',
    publicArtNote: 'सार्वजनिक कला शोकेस · लोकल एसेट्स',

    moderationTitle: 'मित्र मंडली मॉडरेशन प्रीव्यू [SIM]',
    moderationSubtitle: 'इंटरैक्टिव लोकल प्रोटोटाइप [SIM]: सेशन मेमोरी में सैंपल केस पर वोट और कोरम नियम देखें।',
    inviteFriends: 'समीक्षक जोड़ें [SIM]',
    activeCases: 'सैंपल केस [SIM]',
    voteAuthentic: 'सैंपल शिल्प मान्य करें [SIM]',
    voteFlag: 'उल्लंघन चिह्नित करें [SIM]',
    friendsQuorum: 'सिम्युलेटेड कोरम: 5 में से 3 [SIM]',
    juryEarnReward: 'डेमो स्कोर: +25 अंक [SIM]',

    cameraPerm: 'कैमरा (नाखून कला फोटो और संदर्भ स्कैन)',
    notifyPerm: 'पुश सूचनाएं (ब्राउज़र रिमाइंडर प्रीव्यू)',
    geoPerm: 'भू-स्थान (निकटतम सैलून मानचित्र पर खोजें)',
    storagePerm: 'लोकल स्टोरेज (ऑफ़लाइन तुरंत गैलरी लोड)',
    grantAll: 'सभी अनुमतियाँ दें',
    permGranted: 'स्वीकृत',
    permDenied: 'अस्वीकृत',
    permPrompt: 'अनुरोध...',

    checkoutTitle: 'डेमो मल्टी-करेंसी चेकआउट [SIM]',
    smartContractEscrow: 'सिम्युलेटेड डिपॉज़िट होल्ड प्रीव्यू [SIM]',
    payWithCrypto: 'डेमो टोकन प्रीव्यू (USDC, ETH, SOL, $NAIL) [SIM]',
    payWithFiat: 'डेमो कार्ड प्रीव्यू (USD, EUR, GBP) [SIM]',
    tipArtist: 'मास्टर टिप',
    confirmPayment: 'डेमो बुकिंग कन्फर्म करें [SIM]',
    escrowSecured: 'सेशन में डेमो बुकिंग दर्ज [SIM]',

    e2eEncryptedChat: 'स्टूडियो कंसीयर्ज चैट प्रीव्यू [SIM]',
    typeMessage: 'संदेश लिखें...',
    sendQuote: 'डेमो कोट भेजें [SIM]',
  },

  ar: {
    appName: 'Nailix',
    tagline: 'شبكة فن طلاء الأظافر الراقية',
    explore: 'معرض الفنون',
    artists: 'الخبراء',
    friendModeration: 'هيئة الأصدقاء [SIM]',
    reputation: 'سجل السمعة [SIM]',
    instagram: 'عرض إنستا [SIM]',
    cryptocloud: 'مزامنة محلية [SIM]',
    analytics: 'التحليلات [LOCAL]',
    bookNow: 'احجز الآن',
    consultation: 'محادثة الاستوديو [SIM]',
    switchRoleClient: 'وضع العميل',
    switchRoleMaster: 'وضع الخبير',
    installApp: 'تثبيت PWA',
    androidBuild: 'PWA / بناء APK محلي',
    permissionsTitle: 'أذونات الجهاز',

    heroBadge: 'أزياء راقية · نقوش وزخارف فاخرة · ورشة حرفية',
    heroTitle1: 'ألوان صبغية مشعة.',
    heroTitle2: 'نقوش وزخارف بديعة.',
    heroTitle3: 'فن الأظافر الراقي.',
    heroSubtitle: 'معرض فنون الأظافر الفاخرة مع رادار الصالونات القريبة وتصدير التقويم RFC 5545 — مقترنًا بنماذج تفاعلية [SIM] للمحادثة وهيئة التحكيم والدفع التجريبي.',
    exploreCollection: 'استكشف المجموعة',
    bookSession: 'احجز موعدك',
    liveSwarmP2P: 'محاكاة البث المحلي [SIM]',

    galleryTitle: 'معرض الأزياء الراقية العام',
    gallerySubtitle: 'تصاميم أظافر عالية الدقة محفوظة محلياً للتصفح دون اتصال والحجز المباشر.',
    allCategories: 'كافة الأنماط',
    bookThisLook: 'احجز هذا التصميم',
    publicArtNote: 'معرض فني عام · أصول محلية',

    moderationTitle: 'معاينة إشراف دائرة الأصدقاء [SIM]',
    moderationSubtitle: 'نموذج محلي تفاعلي [SIM]: صوّت على حالات تجريبية لمعاينة آلية النصاب داخل الجلسة الحالية.',
    inviteFriends: 'إضافة مراجع للجلسة [SIM]',
    activeCases: 'حالات تجريبية [SIM]',
    voteAuthentic: 'اعتماد العينة [SIM]',
    voteFlag: 'الإبلاغ عن العينة [SIM]',
    friendsQuorum: 'نصاب تجريبي: 3 من 5 [SIM]',
    juryEarnReward: 'نقاط العرض: +25 نقطة [SIM]',

    cameraPerm: 'الكاميرا (تصوير الأظافر ومسح المراجع)',
    notifyPerm: 'الإشعارات (معاينة تنبيهات المتصفح للمواعيد)',
    geoPerm: 'الموقع الجغرافي (العثور على أقرب صالونات)',
    storagePerm: 'التخزين المحلي (تحميل فوري في وضع عدم الاتصال)',
    grantAll: 'منح كافة الأذونات',
    permGranted: 'تم المنح',
    permDenied: 'مرفوض',
    permPrompt: 'جارِ الطلب...',

    checkoutTitle: 'دفع تجريبي متعدد العملات [SIM]',
    smartContractEscrow: 'محاكاة حجز العربون التجريبي [SIM]',
    payWithCrypto: 'معاينة رموز تجريبية (USDC, ETH, SOL, $NAIL) [SIM]',
    payWithFiat: 'معاينة بطاقة تجريبية (USD, EUR, GBP) [SIM]',
    tipArtist: 'إكرامية الفنان',
    confirmPayment: 'تأكيد الحجز التجريبي [SIM]',
    escrowSecured: 'تم تسجيل الحجز التجريبي في الجلسة [SIM]',

    e2eEncryptedChat: 'معاينة محادثة الاستوديو [SIM]',
    typeMessage: 'اكتب رسالة...',
    sendQuote: 'إرسال عرض تجريبي [SIM]',
  },

  pt: {
    appName: 'Nailix',
    tagline: 'Rede de Arte em Unhas de Alta-Costura',
    explore: 'Galeria de Arte',
    artists: 'Mestres',
    friendModeration: 'Júri [SIM]',
    reputation: 'Registro [SIM]',
    instagram: 'Insta Demo [SIM]',
    cryptocloud: 'Sincronia Local [SIM]',
    analytics: 'Métricas [LOCAL]',
    bookNow: 'Agendar Agora',
    consultation: 'Chat Estúdio [SIM]',
    switchRoleClient: 'Modo Cliente',
    switchRoleMaster: 'Modo Mestre',
    installApp: 'Instalar PWA',
    androidBuild: 'PWA / APK Local',
    permissionsTitle: 'Permissões do Aparelho',

    heroBadge: 'ALTA-COSTURA · ORNAMENTOS REFINADOS · ATELIÊ ARTESANAL',
    heroTitle1: 'Pigmentos Luminosos Radiantes.',
    heroTitle2: 'Filigranas e Arabescos.',
    heroTitle3: 'Manicure de Alta-Costura.',
    heroSubtitle: 'Vitrine de arte em unhas com radar de salões e exportação de calendário RFC 5545 — com prévias interativas [SIM] de chat, júri de amigos e checkout demonstrativo.',
    exploreCollection: 'Explorar Galeria',
    bookSession: 'Agendar Sessão',
    liveSwarmP2P: 'Sincronia Local [SIM]',

    galleryTitle: 'Galeria Pública de Alta-Costura',
    gallerySubtitle: 'Conjuntos em alta resolução empacotados localmente para visualização offline e agendamento direto.',
    allCategories: 'Todas as Estéticas',
    bookThisLook: 'Agendar Este Estilo',
    publicArtNote: 'Vitrine Pública · Recursos Locais',

    moderationTitle: 'Prévia de Moderação por Amigos [SIM]',
    moderationSubtitle: 'Protótipo local interativo [SIM]: vote em casos de amostra na sessão atual para testar o quórum.',
    inviteFriends: 'Convidar Revisor Demo [SIM]',
    activeCases: 'Casos de Amostra [SIM]',
    voteAuthentic: 'Aprovar Amostra [SIM]',
    voteFlag: 'Sinalizar Amostra [SIM]',
    friendsQuorum: 'Quórum Simulado: 3 de 5 [SIM]',
    juryEarnReward: 'Pontuação Demo: +25 pts [SIM]',

    cameraPerm: 'Câmera (Fotos de unhas e leitura de referências)',
    notifyPerm: 'Notificações Push (Prévia local de lembretes)',
    geoPerm: 'Geolocalização (Localizar estúdios artísticos mais próximos)',
    storagePerm: 'Armazenamento Local (Carregamento instantâneo offline)',
    grantAll: 'Conceder Todas as Permissões',
    permGranted: 'Concedido',
    permDenied: 'Negado',
    permPrompt: 'Solicitando...',

    checkoutTitle: 'Checkout Demonstrativo Multimoedas [SIM]',
    smartContractEscrow: 'Simulação de Depósito em Sessão [SIM]',
    payWithCrypto: 'Prévia Token Demo (USDC, ETH, SOL, $NAIL) [SIM]',
    payWithFiat: 'Prévia Cartão Demo (USD, EUR, GBP) [SIM]',
    tipArtist: 'Gorjeta ao Mestre',
    confirmPayment: 'Confirmar Reserva Demo [SIM]',
    escrowSecured: 'Reserva Demo Salva na Sessão [SIM]',

    e2eEncryptedChat: 'Prévia de Chat com o Estúdio [SIM]',
    typeMessage: 'Digite uma mensagem...',
    sendQuote: 'Enviar Orçamento Demo [SIM]',
  },

  fr: {
    appName: 'Nailix',
    tagline: 'Réseau d’Art Ongulaire Haute Couture',
    explore: 'Galerie d’Art',
    artists: 'Maîtres Artisans',
    friendModeration: 'Jury [SIM]',
    reputation: 'Registre [SIM]',
    instagram: 'Démo Insta [SIM]',
    cryptocloud: 'Synchro Locale [SIM]',
    analytics: 'Analytique [LOCAL]',
    bookNow: 'Réserver',
    consultation: 'Chat Atelier [SIM]',
    switchRoleClient: 'Mode Client',
    switchRoleMaster: 'Mode Maître',
    installApp: 'Installer PWA',
    androidBuild: 'PWA / APK Local',
    permissionsTitle: 'Autorisations de l’Appareil',

    heroBadge: 'HAUTE COUTURE · ORNEMENTS PRÉCIEUX · ATELIER D’ART',
    heroTitle1: 'Pigments Lumineux Éclatants.',
    heroTitle2: 'Volutes et Filigranes Raffinés.',
    heroTitle3: 'Haute Manucure Artisanale.',
    heroSubtitle: 'Vitrine d’art ongulaire avec radar des salons et export calendrier RFC 5545 — complétée par des aperçus interactifs [SIM] de messagerie, jury d’amis et paiement démo.',
    exploreCollection: 'Découvrir la Galerie',
    bookSession: 'Réserver un Créneau',
    liveSwarmP2P: 'Diffusion Locale [SIM]',

    galleryTitle: 'Galerie Publique Haute Couture',
    gallerySubtitle: 'Créations haute résolution incluses localement pour une consultation hors ligne et une réservation directe.',
    allCategories: 'Tous les Styles',
    bookThisLook: 'Réserver ce Look',
    publicArtNote: 'Vitrine Publique · Ressources Locales',

    moderationTitle: 'Aperçu Modération par Cercle d’Amis [SIM]',
    moderationSubtitle: 'Prototype interactif local [SIM] : votez sur des cas exemples dans la session pour tester la règle de quorum.',
    inviteFriends: 'Ajouter un Arbitre Démo [SIM]',
    activeCases: 'Cas Exemples en Session [SIM]',
    voteAuthentic: 'Valider l’Exemple [SIM]',
    voteFlag: 'Signaler l’Exemple [SIM]',
    friendsQuorum: 'Quorum Simulé : 3 sur 5 [SIM]',
    juryEarnReward: 'Score Démo : +25 pts [SIM]',

    cameraPerm: 'Appareil Photo (Clichés d’ongles et scan de références)',
    notifyPerm: 'Notifications Push (Aperçu navigateur des rappels)',
    geoPerm: 'Géolocalisation (Salons d’art les plus proches)',
    storagePerm: 'Stockage Local (Chargement instantané hors ligne)',
    grantAll: 'Accorder Toutes les Autorisations',
    permGranted: 'Accordé',
    permDenied: 'Refusé',
    permPrompt: 'Demande en cours...',

    checkoutTitle: 'Paiement Démo Multidevises [SIM]',
    smartContractEscrow: 'Simulation de Dépôt de Garantie [SIM]',
    payWithCrypto: 'Aperçu Jeton Démo (USDC, ETH, SOL, $NAIL) [SIM]',
    payWithFiat: 'Aperçu Carte Démo (EUR, USD, GBP) [SIM]',
    tipArtist: 'Pourboire Artiste',
    confirmPayment: 'Confirmer Réservation Démo [SIM]',
    escrowSecured: 'Réservation Démo Enregistrée [SIM]',

    e2eEncryptedChat: 'Aperçu Chat Conciergerie Studio [SIM]',
    typeMessage: 'Écrire un message...',
    sendQuote: 'Envoyer Devis Démo [SIM]',
  },

  ja: {
    appName: 'Nailix',
    tagline: 'オートクチュール ネイルアートネットワーク',
    explore: 'アートギャラリー',
    artists: 'マスター名鑑',
    friendModeration: '陪審デモ [SIM]',
    reputation: '評価台帳 [SIM]',
    instagram: 'インスタ連携 [SIM]',
    cryptocloud: 'ローカル同期 [SIM]',
    analytics: '統計 [LOCAL]',
    bookNow: '予約する',
    consultation: 'アトリエチャット [SIM]',
    switchRoleClient: 'クライアントモード',
    switchRoleMaster: 'マスターモード',
    installApp: 'PWAをインストール',
    androidBuild: 'PWA / ローカルAPK',
    permissionsTitle: '端末の権限設定',

    heroBadge: 'オートクチュール · 繊細な装飾美 · 匠のアトリエ',
    heroTitle1: '深みある輝きの鉱物顔料。',
    heroTitle2: '繊細なフィリグリー装飾紋様。',
    heroTitle3: '至高のクチュールネイル。',
    heroSubtitle: 'サロン位置レーダーとRFC 5545カレンダー書き出しを備えたクチュールネイルのショーケース。アトリエチャット・フレンド審査・多通貨決済のインタラクティブデモ [SIM] を体験できます。',
    exploreCollection: 'コレクションを見る',
    bookSession: 'マスター枠を予約',
    liveSwarmP2P: 'ローカル同期シミュレーター [SIM]',

    galleryTitle: '公開オートクチュールギャラリー',
    gallerySubtitle: 'オフラインでも即座に閲覧でき、そのまま予約へ進めるローカル収録ネイルコレクション。',
    allCategories: 'すべてのスタイル',
    bookThisLook: 'このスタイルを予約',
    publicArtNote: '公開ショーケース · ローカル資産',

    moderationTitle: 'フレンド審査プレビュー [SIM]',
    moderationSubtitle: 'ローカル状態プロトタイプ [SIM]：現在のブラウザセッション上でサンプル審査の投票フローを試せます。',
    inviteFriends: 'デモ審査員を追加 [SIM]',
    activeCases: 'サンプル審査案件 [SIM]',
    voteAuthentic: 'サンプルを承認 [SIM]',
    voteFlag: 'サンプルを報告 [SIM]',
    friendsQuorum: '模擬定足数：5人中3人 [SIM]',
    juryEarnReward: 'デモスコア：+25 pt [SIM]',

    cameraPerm: 'カメラ権限（ネイル撮影およびデザイン参照）',
    notifyPerm: 'プッシュ通知（ブラウザでの予約通知プレビュー）',
    geoPerm: '位置情報（最寄りのサロンを検索）',
    storagePerm: 'ローカルストレージ（オフラインでの高速ギャラリー表示）',
    grantAll: 'すべての権限を一括許可',
    permGranted: '許可済み',
    permDenied: '拒否',
    permPrompt: 'リクエスト中...',

    checkoutTitle: '多通貨決済デモ [SIM]',
    smartContractEscrow: 'デモ予約金ホールド表示 [SIM]',
    payWithCrypto: 'デモトークン表示 (USDC, ETH, SOL, $NAIL) [SIM]',
    payWithFiat: 'デモカード表示 (USD, EUR, GBP) [SIM]',
    tipArtist: 'マスターへのチップ',
    confirmPayment: 'デモ予約を確定 [SIM]',
    escrowSecured: 'セッションにデモ予約を記録しました [SIM]',

    e2eEncryptedChat: 'アトリエコンシェルジュチャット [SIM]',
    typeMessage: 'メッセージを入力...',
    sendQuote: 'デモ見積書を送信 [SIM]',
  },

  de: {
    appName: 'Nailix',
    tagline: 'Haute-Couture Maniküre-Kunstnetzwerk',
    explore: 'Kunstgalerie',
    artists: 'Meister',
    friendModeration: 'Freunde-Jury [SIM]',
    reputation: 'Register [SIM]',
    instagram: 'Insta-Demo [SIM]',
    cryptocloud: 'Lokal-Sync [SIM]',
    analytics: 'Analysen [LOCAL]',
    bookNow: 'Termin Buchen',
    consultation: 'Atelier-Chat [SIM]',
    switchRoleClient: 'Kundenmodus',
    switchRoleMaster: 'Meistermodus',
    installApp: 'PWA Installieren',
    androidBuild: 'PWA / Lokale APK',
    permissionsTitle: 'Geräteberechtigungen',

    heroBadge: 'HAUTE COUTURE · EXQUISITE ORNAMENTE · MEISTER-ATELIER',
    heroTitle1: 'Strahlende Leuchtpigmente.',
    heroTitle2: 'Filigrane Luxus-Ornamente.',
    heroTitle3: 'Haute-Couture Maniküre.',
    heroSubtitle: 'Kuratierte Nagelkunst-Galerie mit Studio-Distanzradar und RFC-5545-Kalenderexport — ergänzt um interaktive [SIM]-Vorschauen für Atelier-Chat, Freunde-Jury und Demo-Checkout.',
    exploreCollection: 'Kollektion Entdecken',
    bookSession: 'Meister-Slot Reservieren',
    liveSwarmP2P: 'Lokaler Sync-Simulator [SIM]',

    galleryTitle: 'Öffentliche Haute-Couture-Galerie',
    gallerySubtitle: 'Lokal gebündelte Maniküre-Looks für schnelle Offline-Ansicht und direkte Terminbuchung.',
    allCategories: 'Alle Stilrichtungen',
    bookThisLook: 'Diesen Look Buchen',
    publicArtNote: 'Öffentliche Galerie · Lokale Assets',

    moderationTitle: 'Freundeskreis-Moderation Vorschau [SIM]',
    moderationSubtitle: 'Interaktiver lokaler Prototyp [SIM]: Testen Sie Abstimmungen und Quorum-Regeln direkt im Sitzungsspeicher.',
    inviteFriends: 'Demo-Prüfer hinzufügen [SIM]',
    activeCases: 'Beispielfälle in Sitzung [SIM]',
    voteAuthentic: 'Muster Bestätigen [SIM]',
    voteFlag: 'Muster Melden [SIM]',
    friendsQuorum: 'Simuliertes Quorum: 3 von 5 [SIM]',
    juryEarnReward: 'Demo-Punkte: +25 Score [SIM]',

    cameraPerm: 'Kamera (Nagelfotografie & Referenz-Scans)',
    notifyPerm: 'Push-Benachrichtigungen (Lokale Browser-Vorschau)',
    geoPerm: 'Standort (Salons in der Nähe auf der Karte finden)',
    storagePerm: 'Lokaler Speicher (Sofortiges Offline-Laden der Galerie)',
    grantAll: 'Alle Berechtigungen Erteilen',
    permGranted: 'Erteilt',
    permDenied: 'Verweigert',
    permPrompt: 'Wird angefordert...',

    checkoutTitle: 'Demo-Multiwährungs-Checkout [SIM]',
    smartContractEscrow: 'Simulierte Anzahlungs-Vorschau [SIM]',
    payWithCrypto: 'Demo-Token-Vorschau (USDC, ETH, SOL, $NAIL) [SIM]',
    payWithFiat: 'Demo-Karten-Vorschau (EUR, USD, GBP) [SIM]',
    tipArtist: 'Trinkgeld für den Meister',
    confirmPayment: 'Demo-Buchung Bestätigen [SIM]',
    escrowSecured: 'Demo-Buchung in Sitzung gespeichert [SIM]',

    e2eEncryptedChat: 'Atelier-Concierge-Chat Vorschau [SIM]',
    typeMessage: 'Nachricht schreiben...',
    sendQuote: 'Demo-Angebot Senden [SIM]',
  },
};

export function detectUserLanguage(): SupportedLanguage {
  if (typeof window === 'undefined' || !window.navigator) {
    return 'en';
  }

  const rawLanguages = window.navigator.languages || [window.navigator.language];
  for (const lang of rawLanguages) {
    if (!lang) continue;
    const clean = lang.toLowerCase().slice(0, 2);
    if (clean === 'ru') return 'ru';
    if (clean === 'es') return 'es';
    if (clean === 'zh') return 'zh';
    if (clean === 'hi') return 'hi';
    if (clean === 'ar') return 'ar';
    if (clean === 'pt') return 'pt';
    if (clean === 'fr') return 'fr';
    if (clean === 'ja') return 'ja';
    if (clean === 'de') return 'de';
    if (clean === 'en') return 'en';
  }

  return 'en';
}
