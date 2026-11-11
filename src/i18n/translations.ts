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
    friendModeration: 'Friend Jury',
    reputation: 'Blockchain Ledger',
    instagram: 'Insta Sync',
    cryptocloud: 'P2P Cloud',
    analytics: 'Analytics',
    bookNow: 'Book Session',
    consultation: 'Encrypted Chat',
    switchRoleClient: 'Client Mode',
    switchRoleMaster: 'Master Mode',
    installApp: 'Install Android App',
    androidBuild: 'Android APK / TWA',
    permissionsTitle: 'Device Permissions',

    heroBadge: 'EXQUISITE NAIL COUTURE · LUXURY ORNAMENTS · ARTISAN ATELIER',
    heroTitle1: 'Radiant Luminous Pigments.',
    heroTitle2: 'Intricate Filigree Ornaments.',
    heroTitle3: 'Haute Manicure Couture.',
    heroSubtitle: 'Decentralized social network uniting world-class manicure sculptors and devotees. Public high-speed art showcase, end-to-end encrypted private chats, multi-currency escrow, and friend-circle peer moderation.',
    exploreCollection: 'Explore Master Collection',
    bookSession: 'Lock Master Slot',
    liveSwarmP2P: 'P2P Swarm Active',

    galleryTitle: 'Public Haute Couture Gallery',
    gallerySubtitle: 'High-res manicure sets synced across open peer swarms. No encryption required on public nail art — express your craft freely to the universe.',
    allCategories: 'All Aesthetics',
    bookThisLook: 'Book This Sculptural Look',
    publicArtNote: 'Public P2P Art Stream · Zero Censorship',

    moderationTitle: 'Friend Circle Consensus Moderation',
    moderationSubtitle: 'Decentralized Web-of-Trust Jury: Friends and trusted peers vote on content reports, verify handmade nail craft versus AI, and earn community reputation.',
    inviteFriends: 'Invite Friend to Jury Circle',
    activeCases: 'Pending Peer Verifications',
    voteAuthentic: 'Verify Genuine Handcraft (Vouch)',
    voteFlag: 'Flag Violation / Dispute',
    friendsQuorum: 'Friend Quorum: 3 of 5 needed',
    juryEarnReward: 'Reward: +25 $NAIL Taste Score',

    cameraPerm: 'Camera & Macro Lens (Live nail check & reference scan)',
    notifyPerm: 'Push Notifications (24h & 2h appointment reminders)',
    geoPerm: 'Geolocation (Find nearest top certified master salons)',
    storagePerm: 'Local Gallery Cache (Instant offline artwork loading)',
    grantAll: 'Grant All Permissions',
    permGranted: 'Granted',
    permDenied: 'Denied',
    permPrompt: 'Requesting...',

    checkoutTitle: 'Decentralized Multi-Currency Checkout',
    smartContractEscrow: 'Smart Contract Escrow Guarantee',
    payWithCrypto: 'Crypto (USDC, ETH, SOL, $NAIL)',
    payWithFiat: 'Card / Fiat (USD, EUR, GBP)',
    tipArtist: 'Master Gratuity',
    confirmPayment: 'Lock Escrow Payment',
    escrowSecured: 'Escrow Secured On-Chain',

    e2eEncryptedChat: 'End-to-End Encrypted Private Chat',
    typeMessage: 'Type message...',
    sendQuote: 'Send Booking Quote',

    salonMap: 'Map & Proximity',
    themeToggle: 'Theme',
    sponsorAd: 'Sponsored Deals',
  },

  ru: {
    appName: 'Nailix',
    tagline: 'Арт-Сеть Высокого Маникюра',
    explore: 'Арт-Галерея',
    artists: 'Мастера',
    friendModeration: 'Дружеский Совет',
    reputation: 'Блокчейн-Леджер',
    instagram: 'Инста-Синхрон',
    cryptocloud: 'P2P Клауд',
    analytics: 'Аналитика',
    bookNow: 'Записаться',
    consultation: 'Шифрованный Чат',
    switchRoleClient: 'Режим Клиента',
    switchRoleMaster: 'Режим Мастера',
    installApp: 'Установить на Android',
    androidBuild: 'Билд для Android',
    permissionsTitle: 'Разрешения Устройства',

    heroBadge: 'HAUTE COUTURE · АВТОРСКИЕ ОРНАМЕНТЫ · ЭЛИТНЫЕ АТЕЛЬЕ',
    heroTitle1: 'Сияющие Глубокие Пигменты.',
    heroTitle2: 'Изысканные Узоры и Орнаменты.',
    heroTitle3: 'Высокое Искусство Маникюра.',
    heroSubtitle: 'Децентрализованная арт-сеть для мастеров и ценителей авторского маникюра. Публичная открытая галерея без шифрования картинок, криптографический E2E чат, мультивалютный эскроу-кошелёк и модерация контента кругом друзей.',
    exploreCollection: 'Смотреть Коллекцию Узоров',
    bookSession: 'Забронировать Слот',
    liveSwarmP2P: 'P2P Сеть Активна',

    galleryTitle: 'Публичная Кутюрная Галерея',
    gallerySubtitle: 'Сверхчёткие работы мастеров, распространяемые по открытой P2P-сети. Арт не требует шифрования — красота должна быть открыта всему миру!',
    allCategories: 'Все Стилистики',
    bookThisLook: 'Записаться на Этот Дизайн',
    publicArtNote: 'Открытый P2P Арт · Без Цензуры',

    moderationTitle: 'Модерация Контента с Привлечением Друзей',
    moderationSubtitle: 'Децентрализованный совет доверия (Web-of-Trust): круг проверенных друзей голосует по спорным работам, отсекает плагиат и AI-подделки.',
    inviteFriends: 'Пригласить Друга в Совет',
    activeCases: 'Ждут Решения Друзей',
    voteAuthentic: 'Подтвердить Подлинность (Vouch)',
    voteFlag: 'Отклонить Нарушение',
    friendsQuorum: 'Кворум Друзей: 3 из 5 голосов',
    juryEarnReward: 'Награда: +25 $NAIL за вердикт',

    cameraPerm: 'Камера (Фотосъёмка ногтей и сканирование референсов)',
    notifyPerm: 'Уведомления (Напоминания о записи за 24ч и 2ч)',
    geoPerm: 'Геолокация (Поиск ближайших салонов и топ-мастеров)',
    storagePerm: 'Локальное Хранилище (Мгновенная загрузка галереи оффлайн)',
    grantAll: 'Предоставить Все Разрешения',
    permGranted: 'Разрешено',
    permDenied: 'Запрещено',
    permPrompt: 'Запрос...',

    checkoutTitle: 'Мультивалютная Оплата с Эскроу',
    smartContractEscrow: 'Гарантия Смарт-Контракта Эскроу',
    payWithCrypto: 'Криптовалюта (USDC, ETH, SOL, $NAIL)',
    payWithFiat: 'Карты / Фиат (USD, EUR, GBP)',
    tipArtist: 'Чаевые Мастеру',
    confirmPayment: 'Заблокировать в Эскроу',
    escrowSecured: 'Эскроу Успешно Заблокирован',

    e2eEncryptedChat: 'Шифрованный E2E Чат Мастера и Клиента',
    typeMessage: 'Напишите сообщение...',
    sendQuote: 'Отправить Смету Записи',

    salonMap: 'Карта Салонов и Близость',
    themeToggle: 'Тема Оформления',
    sponsorAd: 'Спонсорская Реклама',
  },

  es: {
    appName: 'Nailix',
    tagline: 'Red de Arte de Manicura de Alta Costura',
    explore: 'Galería de Arte',
    artists: 'Maestros',
    friendModeration: 'Jurado de Amigos',
    reputation: 'Libro Blockchain',
    instagram: 'Sincronizar Insta',
    cryptocloud: 'Nube P2P',
    analytics: 'Analítica',
    bookNow: 'Reservar Cita',
    consultation: 'Chat Cifrado',
    switchRoleClient: 'Modo Cliente',
    switchRoleMaster: 'Modo Maestro',
    installApp: 'Instalar en Android',
    androidBuild: 'Compilación Android',
    permissionsTitle: 'Permisos del Dispositivo',

    heroBadge: 'ALTA COSTURA · ORNAMENTOS EXQUISITOS · ATELIER ARTESANAL',
    heroTitle1: 'Pigmentos Luminosos Radiantes.',
    heroTitle2: 'Patrones y Filigranas.',
    heroTitle3: 'Manicura de Alta Costura.',
    heroSubtitle: 'Red social descentralizada que reúne a destacados escultores y amantes de la manicura de autor. Arte público sin cifrar, chat privado cifrado E2E, depósito en garantía y moderación por amigos.',
    exploreCollection: 'Explorar Colección',
    bookSession: 'Reservar Maestro',
    liveSwarmP2P: 'Enjambre P2P Activo',

    galleryTitle: 'Galería Pública de Alta Costura',
    gallerySubtitle: 'Obras de arte sincronizadas a través de enjambres P2P. El arte de uñas es público y libre: sin necesidad de cifrar.',
    allCategories: 'Todas las Estéticas',
    bookThisLook: 'Reservar este Diseño',
    publicArtNote: 'Arte P2P Público · Sin Censura',

    moderationTitle: 'Moderación de Contenido por Círculo de Amigos',
    moderationSubtitle: 'Jurado de confianza descentralizado: amigos y pares votan sobre contenido reportado y verifican el trabajo artesanal auténtico.',
    inviteFriends: 'Invitar Amigos al Jurado',
    activeCases: 'Verificaciones Pendientes',
    voteAuthentic: 'Validar Autenticidad (Voto)',
    voteFlag: 'Reportar Infracción',
    friendsQuorum: 'Quórum de Amigos: 3 de 5 necesarios',
    juryEarnReward: 'Recompensa: +25 $NAIL Score',

    cameraPerm: 'Cámara (Fotos de manicura y escaneo de referencias)',
    notifyPerm: 'Notificaciones Push (Recordatorios a 24h y 2h)',
    geoPerm: 'Geolocalización (Buscar salones maestros certificados en la zona)',
    storagePerm: 'Almacenamiento Local (Carga rápida offline de la galería)',
    grantAll: 'Conceder Todos los Permisos',
    permGranted: 'Concedido',
    permDenied: 'Denegado',
    permPrompt: 'Solicitando...',

    checkoutTitle: 'Pago Multidivisa Seguro con Escrow',
    smartContractEscrow: 'Garantía de Contrato Inteligente Escrow',
    payWithCrypto: 'Cripto (USDC, ETH, SOL, $NAIL)',
    payWithFiat: 'Tarjeta / Fiat (EUR, USD, GBP)',
    tipArtist: 'Propina al Maestro',
    confirmPayment: 'Bloquear Pago en Escrow',
    escrowSecured: 'Escrow Asegurado en Blockchain',

    e2eEncryptedChat: 'Chat Privado Cifrado Extremo a Extremo',
    typeMessage: 'Escribe un mensaje...',
    sendQuote: 'Enviar Presupuesto',
  },

  zh: {
    appName: 'Nailix',
    tagline: '顶级高定美甲艺术网络',
    explore: '艺术画廊',
    artists: '大师名录',
    friendModeration: '好友陪审团',
    reputation: '区块链账本',
    instagram: 'Ins同步',
    cryptocloud: 'P2P云存储',
    analytics: '经营分析',
    bookNow: '立即预约',
    consultation: '加密私聊',
    switchRoleClient: '顾客模式',
    switchRoleMaster: '大师模式',
    installApp: '安装Android版',
    androidBuild: '安卓客户端构建',
    permissionsTitle: '设备权限管理',

    heroBadge: '高级定制 · 华丽纹饰 · 大师工坊',
    heroTitle1: '璀璨流光矿物笔触。',
    heroTitle2: '精致华丽雕花纹饰。',
    heroTitle3: '殿堂级定制美甲。',
    heroSubtitle: '融合奢华艺术纹饰与殿堂级手工雕琢的去中心化美甲社交网络。美甲公开分享无需加密，点对点加密私聊，多币种智能合约托管支付与好友信任陪审团审核。',
    exploreCollection: '浏览星空系列',
    bookSession: '锁定大师工位',
    liveSwarmP2P: 'P2P节点已就绪',

    galleryTitle: '公开高级美甲画廊',
    gallerySubtitle: '通过P2P网络同步超清美甲作品。公开艺术无需加密，尽情向世界展现你的美甲才华。',
    allCategories: '所有美学风格',
    bookThisLook: '预约同款造型',
    publicArtNote: '公开P2P流 · 零审查',

    moderationTitle: '好友圈协同内容审核系统',
    moderationSubtitle: '去中心化信任陪审团：邀请好友共同审核争议作品，甄别手工真实创作与AI剽窃，获得信誉奖励。',
    inviteFriends: '邀请好友加入陪审团',
    activeCases: '待审核争议案例',
    voteAuthentic: '核准真实手作（担保）',
    voteFlag: '驳回违规案例',
    friendsQuorum: '法定好友票数：需要 3/5 票',
    juryEarnReward: '奖励：+25 $NAIL 代币积分',

    cameraPerm: '相机权限（拍摄美甲参考图与现场核验）',
    notifyPerm: '系统推送通知（24小时及2小时预约提醒）',
    geoPerm: '地理位置（定位附近高迪风艺术沙龙）',
    storagePerm: '本地缓存（离线极速加载高画质图集）',
    grantAll: '一键授权所有权限',
    permGranted: '已授权',
    permDenied: '已拒绝',
    permPrompt: '请求中...',

    checkoutTitle: '多币种智能托管安全结算',
    smartContractEscrow: '智能合约托管安全担保',
    payWithCrypto: '加密代币 (USDC, ETH, SOL, $NAIL)',
    payWithFiat: '法定货币/银联信用卡 (USD, EUR, GBP)',
    tipArtist: '大师小费',
    confirmPayment: '锁定托管资金',
    escrowSecured: '链上资金已成功锁定',

    e2eEncryptedChat: '端到端加密定制私聊',
    typeMessage: '输入消息...',
    sendQuote: '发送定制报价单',
  },

  hi: {
    appName: 'Nailix',
    tagline: 'हॉट कॉउचर मैनीक्योर आर्ट नेटवर्क',
    explore: 'कला दीर्घा',
    artists: 'मास्टर्स',
    friendModeration: 'मित्र जूरी',
    reputation: 'ब्लॉकचेन लेजर',
    instagram: 'इंस्टा सिंक',
    cryptocloud: 'P2P क्लाउड',
    analytics: 'एनालिटिक्स',
    bookNow: 'बुक करें',
    consultation: 'सुरक्षित चैट',
    switchRoleClient: 'ग्राहक मोड',
    switchRoleMaster: 'मास्टर मोड',
    installApp: 'एंड्रॉइड ऐप इंस्टॉल करें',
    androidBuild: 'एंड्रॉइड बिल्ड',
    permissionsTitle: 'डिवाइस अनुमतियाँ',

    heroBadge: 'हॉट कॉउचर · उत्कृष्ट आभूषण · आर्टिसन स्टूडियो',
    heroTitle1: 'दीप्तिमान खनिज पिगमेंट।',
    heroTitle2: 'जटिल नक्काशीदार पैटर्न।',
    heroTitle3: 'हॉट कॉउचर मैनीक्योर।',
    heroSubtitle: 'शीर्ष मैनीक्योर कलाकारों और कला प्रेमियों को जोड़ने वाला विकेंद्रीकृत नेटवर्क। ओपन आर्ट गैलरी, एन्क्रिप्टेड चैट, मल्टी-करेंसी एस्क्रो और दोस्तों की जूरी द्वारा मॉडरेशन।',
    exploreCollection: 'कलेक्शन देखें',
    bookSession: 'स्लॉट बुक करें',
    liveSwarmP2P: 'P2P स्वाम सक्रिय',

    galleryTitle: 'सार्वजनिक हॉट कॉउचर गैलरी',
    gallerySubtitle: 'पब्लिक P2P नेटवर्क पर नाखून कला। कला को छिपाने की जरूरत नहीं है - यह पूरी दुनिया के लिए खुली है।',
    allCategories: 'सभी शैलियाँ',
    bookThisLook: 'यह लुक बुक करें',
    publicArtNote: 'खुली कला · शून्य सेंसरशिप',

    moderationTitle: 'मित्र मंडली सामग्री मॉडरेशन',
    moderationSubtitle: 'विकेंद्रीकृत जूरी: मित्र और साथी कलाकार रिपोर्ट की गई सामग्री की जांच करते हैं और असली कला को प्रमाणित करते हैं।',
    inviteFriends: 'मित्रों को जूरी में आमंत्रित करें',
    activeCases: 'लंबित सत्यापन',
    voteAuthentic: 'प्रामाणिक शिल्प सत्यापित करें',
    voteFlag: 'उल्लंघन रिपोर्ट करें',
    friendsQuorum: 'मित्र कोरम: 5 में से 3 आवश्यक',
    juryEarnReward: 'इनाम: +25 $NAIL टेस्ट स्कोर',

    cameraPerm: 'कैमरा (नाखून कला फोटो और संदर्भ स्कैन)',
    notifyPerm: 'पुश सूचनाएं (24 घंटे और 2 घंटे अनुस्मारक)',
    geoPerm: 'भू-स्थान (निकटतम मास्टर सैलून खोजें)',
    storagePerm: 'लोकल स्टोरेज (ऑफ़लाइन तुरंत गैलरी लोड)',
    grantAll: 'सभी अनुमतियाँ दें',
    permGranted: 'स्वीकृत',
    permDenied: 'अस्वीकृत',
    permPrompt: 'अनुरोध...',

    checkoutTitle: 'सुरक्षित मल्टी-करेंसी चेकआउट',
    smartContractEscrow: 'स्मार्ट अनुबंध एस्क्रो गारंटी',
    payWithCrypto: 'क्रिप्टो (USDC, ETH, SOL, $NAIL)',
    payWithFiat: 'कार्ड / फिएट (USD, EUR, GBP)',
    tipArtist: 'मास्टर टिप',
    confirmPayment: 'एस्क्रो लॉक करें',
    escrowSecured: 'एस्क्रो सुरक्षित हो गया',

    e2eEncryptedChat: 'एन्क्रिप्टेड निजी चैट',
    typeMessage: 'संदेश लिखें...',
    sendQuote: 'बुकिंग उद्धरण भेजें',
  },

  ar: {
    appName: 'Nailix',
    tagline: 'شبكة فن طلاء الأظافر الراقية',
    explore: 'معرض الفنون',
    artists: 'الخبراء',
    friendModeration: 'هيئة الأصدقاء',
    reputation: 'سجل البلوكشين',
    instagram: 'مزامنة انستغرام',
    cryptocloud: 'سحابة P2P',
    analytics: 'التحليلات',
    bookNow: 'احجز الآن',
    consultation: 'محادثة مشفرة',
    switchRoleClient: 'وضع العميل',
    switchRoleMaster: 'وضع الخبير',
    installApp: 'تثبيت على أندرويد',
    androidBuild: 'بناء أندرويد',
    permissionsTitle: 'أذونات الجهاز',

    heroBadge: 'أزياء راقية · نقوش وزخارف فاخرة · ورشة حرفية',
    heroTitle1: 'ألوان صبغية مشعة.',
    heroTitle2: 'نقوش وزخارف بديعة.',
    heroTitle3: 'فن الأظافر الراقي.',
    heroSubtitle: 'شبكة اجتماعية لا مركزية لفن الأظافر تجمع بين أرقى النقوش والمهارة الحرفية الدقيقة. فن عام مفتوح دون تشفير، محادثات خاصة مشفرة تماماً، ودفع آمن متعدد العملات.',
    exploreCollection: 'استكشف المجموعة',
    bookSession: 'احجز موعدك',
    liveSwarmP2P: 'شبكة P2P متصلة',

    galleryTitle: 'معرض الأزياء الراقية العام',
    gallerySubtitle: 'مجموعات أظافر فائقة الدقة عبر شبكات P2P المفتوحة. الفن عام ولا يحتاج تشفيراً.',
    allCategories: 'كافة الأنماط',
    bookThisLook: 'احجز هذا التصميم',
    publicArtNote: 'بث فني مفتوح · بلا قيود',

    moderationTitle: 'إشراف على المحتوى بواسطة دائرة الأصدقاء',
    moderationSubtitle: 'هيئة محلفين لا مركزية: يصوت الأصدقاء الموثوقون على البلاغات ويثبتون الأعمال اليدوية الحقيقية.',
    inviteFriends: 'دعوة صديق لهيئة التحكيم',
    activeCases: 'حالات بانتظار القرار',
    voteAuthentic: 'توثيق العمل اليدوي الأصيل',
    voteFlag: 'رفض الانتهاك',
    friendsQuorum: 'نصاب الأصدقاء: يلزم 3 من 5',
    juryEarnReward: 'المكافأة: +25 $NAIL',

    cameraPerm: 'الكاميرا (تصوير الأظافر ومسح المراجع)',
    notifyPerm: 'الإشعارات (تنبيهات المواعيد قبل 24 و 2 ساعة)',
    geoPerm: 'الموقع الجغرافي (العثور على أقرب صالونات)',
    storagePerm: 'التخزين المحلي (تحميل فوري في وضع عدم الاتصال)',
    grantAll: 'منح كافة الأذونات',
    permGranted: 'تم المنح',
    permDenied: 'مرفوض',
    permPrompt: 'جارِ الطلب...',

    checkoutTitle: 'دفع آمن متعدد العملات مع ضمان',
    smartContractEscrow: 'ضمان العقد الذكي الآمن',
    payWithCrypto: 'عملات مشفرة (USDC, ETH, SOL, $NAIL)',
    payWithFiat: 'بطاقات / عملات تقليدية (USD, EUR, GBP)',
    tipArtist: 'إكرامية الفنان',
    confirmPayment: 'تأكيد الحجز في الضمان',
    escrowSecured: 'تم تأمين الضمان بنجاح',

    e2eEncryptedChat: 'محادثة مشفرة من طرف إلى طرف',
    typeMessage: 'اكتب رسالة...',
    sendQuote: 'إرسال عرض سعر',
  },

  pt: {
    appName: 'Nailix',
    tagline: 'Rede de Arte em Unhas de Alta-Costura',
    explore: 'Galeria de Arte',
    artists: 'Mestres',
    friendModeration: 'Júri de Amigos',
    reputation: 'Registro Blockchain',
    instagram: 'Sincronizar Insta',
    cryptocloud: 'Nuvem P2P',
    analytics: 'Métricas',
    bookNow: 'Agendar Agora',
    consultation: 'Chat Criptografado',
    switchRoleClient: 'Modo Cliente',
    switchRoleMaster: 'Modo Mestre',
    installApp: 'Instalar no Android',
    androidBuild: 'Build para Android',
    permissionsTitle: 'Permissões do Aparelho',

    heroBadge: 'ALTA-COSTURA · ORNAMENTOS REFINADOS · ATELIÊ ARTESANAL',
    heroTitle1: 'Pigmentos Luminosos Radiantes.',
    heroTitle2: 'Filigranas e Arabescos.',
    heroTitle3: 'Manicure de Alta-Costura.',
    heroSubtitle: 'Rede social descentralizada que une escultores de unhas de classe mundial e entusiastas da arte. Arte pública livre, chat criptografado ponta a ponta, custódia inteligente e moderação entre amigos.',
    exploreCollection: 'Explorar Galeria',
    bookSession: 'Agendar Sessão',
    liveSwarmP2P: 'Rede P2P Ativa',

    galleryTitle: 'Galeria Pública de Alta-Costura',
    gallerySubtitle: 'Conjuntos de unhas de alta resolução distribuídos em redes P2P abertas. A arte é pública e não precisa de criptografia.',
    allCategories: 'Todas as Estéticas',
    bookThisLook: 'Agendar Este Estilo',
    publicArtNote: 'Fluxo P2P Público · Sem Censura',

    moderationTitle: 'Moderação de Conteúdo com Círculo de Amigos',
    moderationSubtitle: 'Júri de Confiança Descentralizado: amigos e artesãos votam em denúncias, atestam trabalho manual autêntico e ganham reputação.',
    inviteFriends: 'Convidar Amigo para o Júri',
    activeCases: 'Casos Pendentes de Voto',
    voteAuthentic: 'Validar Autenticidade Manual',
    voteFlag: 'Rejeitar Violação',
    friendsQuorum: 'Quórum de Amigos: 3 de 5 necessários',
    juryEarnReward: 'Recompensa: +25 $NAIL Score',

    cameraPerm: 'Câmera (Fotos de unhas e leitura de referências)',
    notifyPerm: 'Notificações Push (Lembretes com 24h e 2h de antecedência)',
    geoPerm: 'Geolocalização (Localizar estúdios artísticos mais próximos)',
    storagePerm: 'Armazenamento Local (Carregamento instantâneo offline)',
    grantAll: 'Conceder Todas as Permissões',
    permGranted: 'Concedido',
    permDenied: 'Negado',
    permPrompt: 'Solicitando...',

    checkoutTitle: 'Checkout Seguro Multimoedas',
    smartContractEscrow: 'Garantia de Custódia por Contrato Inteligente',
    payWithCrypto: 'Cripto (USDC, ETH, SOL, $NAIL)',
    payWithFiat: 'Cartão / Fiat (USD, EUR, GBP)',
    tipArtist: 'Gorjeta ao Mestre',
    confirmPayment: 'Travar Pagamento em Custódia',
    escrowSecured: 'Custódia Protegida na Rede',

    e2eEncryptedChat: 'Chat Privado Criptografado Ponta a Ponta',
    typeMessage: 'Digite uma mensagem...',
    sendQuote: 'Enviar Orçamento',
  },

  fr: {
    appName: 'Nailix',
    tagline: 'Réseau d’Art Ongulaire Haute Couture',
    explore: 'Galerie d’Art',
    artists: 'Maîtres Artisans',
    friendModeration: 'Jury d’Amis',
    reputation: 'Registre Blockchain',
    instagram: 'Sync Insta',
    cryptocloud: 'Nuage P2P',
    analytics: 'Analytique',
    bookNow: 'Réserver',
    consultation: 'Chat Chiffré',
    switchRoleClient: 'Mode Client',
    switchRoleMaster: 'Mode Maître',
    installApp: 'Installer sur Android',
    androidBuild: 'Build Android',
    permissionsTitle: 'Autorisations de l’Appareil',

    heroBadge: 'HAUTE COUTURE · ORNEMENTS PRÉCIEUX · ATELIER D’ART',
    heroTitle1: 'Pigments Lumineux Éclatants.',
    heroTitle2: 'Volutes et Filigranes Raffinés.',
    heroTitle3: 'Haute Manucure Artisanale.',
    heroSubtitle: 'Réseau social décentralisé réunissant les meilleurs créateurs d’art ongulaire et passionnés de haute couture. Galerie d’art publique sans chiffrement, messagerie privée E2E chiffrée, séquestre multidevise et modération par cercle d’amis.',
    exploreCollection: 'Découvrir la Galerie',
    bookSession: 'Réserver un Créneau',
    liveSwarmP2P: 'Essaim P2P Actif',

    galleryTitle: 'Galerie Publique Haute Couture',
    gallerySubtitle: 'Créations ongulaires haute résolution partagées en réseau P2P ouvert. L’art est public et s’exprime librement sans chiffrement.',
    allCategories: 'Tous les Styles',
    bookThisLook: 'Réserver ce Look',
    publicArtNote: 'Flux P2P Public · Zéro Censure',

    moderationTitle: 'Modération Participative par Cercle d’Amis',
    moderationSubtitle: 'Jury de confiance décentralisé : vos amis votent sur les signalements et certifient les créations faites main face aux plagiats.',
    inviteFriends: 'Inviter un Ami au Jury',
    activeCases: 'Vérifications en Attente',
    voteAuthentic: 'Certifier l’Authenticité (Voter)',
    voteFlag: 'Signaler l’Infraction',
    friendsQuorum: 'Quorum d’Amis : 3 sur 5 requis',
    juryEarnReward: 'Récompense : +25 $NAIL Score',

    cameraPerm: 'Appareil Photo (Clichés d’ongles et scan de références)',
    notifyPerm: 'Notifications Push (Rappels de rendez-vous à 24h et 2h)',
    geoPerm: 'Géolocalisation (Salons d’art les plus proches)',
    storagePerm: 'Stockage Local (Chargement instantané hors ligne)',
    grantAll: 'Accorder Toutes les Autorisations',
    permGranted: 'Accordé',
    permDenied: 'Refusé',
    permPrompt: 'Demande en cours...',

    checkoutTitle: 'Paiement Sécurisé Multidevises avec Séquestre',
    smartContractEscrow: 'Garantie de Séquestre par Contrat Intelligent',
    payWithCrypto: 'Crypto (USDC, ETH, SOL, $NAIL)',
    payWithFiat: 'Carte / Devises (EUR, USD, GBP)',
    tipArtist: 'Pourboire Artiste',
    confirmPayment: 'Bloquer le Dépôt en Séquestre',
    escrowSecured: 'Fonds Sécurisés sur la Blockchain',

    e2eEncryptedChat: 'Messagerie Privée Chiffrée de Bout en Bout',
    typeMessage: 'Écrire un message...',
    sendQuote: 'Envoyer un Devis',
  },

  ja: {
    appName: 'Nailix',
    tagline: 'オートクチュール ネイルアートネットワーク',
    explore: 'アートギャラリー',
    artists: 'マスター名鑑',
    friendModeration: 'フレンド陪審員',
    reputation: 'ブロックチェーン台帳',
    instagram: 'インスタ連携',
    cryptocloud: 'P2Pクラウド',
    analytics: '経営分析',
    bookNow: '予約する',
    consultation: '暗号化チャット',
    switchRoleClient: 'クライアントモード',
    switchRoleMaster: 'マスターモード',
    installApp: 'Android版をインストール',
    androidBuild: 'Androidアプリビルド',
    permissionsTitle: '端末の権限設定',

    heroBadge: 'オートクチュール · 繊細な装飾美 · 匠のアトリエ',
    heroTitle1: '深みある輝きの鉱物顔料。',
    heroTitle2: '繊細なフィリグリー装飾紋様。',
    heroTitle3: '至高のクチュールネイル。',
    heroSubtitle: '世界最高峰のネイル彫刻師と愛好家が集う分散型ネイルアートSNS。公開アートは暗号化不要で誰でも閲覧可能、プライベートチャットは完全E2E暗号化、スマートコントラクト多通貨決済、フレンド陪審員による共同モデレーション。',
    exploreCollection: 'コレクションを見る',
    bookSession: 'マスター枠を予約',
    liveSwarmP2P: 'P2Pスウォーム稼働中',

    galleryTitle: '公開オートクチュールギャラリー',
    gallerySubtitle: 'P2Pネットワークで同期される超高画質ネイル作品。ネイルアートは世界に開放されているため暗号化不要です。',
    allCategories: 'すべてのスタイル',
    bookThisLook: 'このスタイルを予約',
    publicArtNote: 'オープンP2Pアート · 検閲ゼロ',

    moderationTitle: 'フレンド陪審員による分散型コンテンツ審査',
    moderationSubtitle: 'Web-of-Trust陪審制度：信頼できる友人グループが報告された作品を審査し、AIや盗用でない本物の手仕事を認定します。',
    inviteFriends: '友人を陪審員に招待',
    activeCases: '審査待ちの事案',
    voteAuthentic: '本物の職人技を認証（保証）',
    voteFlag: '違反として却下',
    friendsQuorum: 'フレンド定足数：5人中3人の賛成が必要',
    juryEarnReward: '報酬：+25 $NAIL 審査スコア',

    cameraPerm: 'カメラ権限（ネイル撮影およびデザイン参照）',
    notifyPerm: 'プッシュ通知（24時間前・2時間前の予約リマインダー）',
    geoPerm: '位置情報（最寄りの認定サロングランプリを検索）',
    storagePerm: 'ローカルストレージ（オフラインでの高速ギャラリー表示）',
    grantAll: 'すべての権限を一括許可',
    permGranted: '許可済み',
    permDenied: '拒否',
    permPrompt: 'リクエスト中...',

    checkoutTitle: '多通貨エスクロー安全決済',
    smartContractEscrow: 'スマートコントラクト・エスクロー保証',
    payWithCrypto: '暗号資産 (USDC, ETH, SOL, $NAIL)',
    payWithFiat: 'クレジットカード / 法定通貨 (USD, EUR, GBP)',
    tipArtist: 'マスターへのチップ',
    confirmPayment: 'エスクローに入金ロック',
    escrowSecured: 'チェーン上でエスクロー完了',

    e2eEncryptedChat: 'エンドツーエンド暗号化プライベートチャット',
    typeMessage: 'メッセージを入力...',
    sendQuote: '予約見積書を送信',
  },

  de: {
    appName: 'Nailix',
    tagline: 'Haute-Couture Maniküre-Kunstnetzwerk',
    explore: 'Kunstgalerie',
    artists: 'Meister',
    friendModeration: 'Freunde-Jury',
    reputation: 'Blockchain-Register',
    instagram: 'Insta-Sync',
    cryptocloud: 'P2P-Cloud',
    analytics: 'Analysen',
    bookNow: 'Termin Buchen',
    consultation: 'Verschlüsselter Chat',
    switchRoleClient: 'Kundenmodus',
    switchRoleMaster: 'Meistermodus',
    installApp: 'Auf Android Installieren',
    androidBuild: 'Android-Build',
    permissionsTitle: 'Geräteberechtigungen',

    heroBadge: 'HAUTE COUTURE · EXQUISITE ORNAMENTE · MEISTER-ATELIER',
    heroTitle1: 'Strahlende Leuchtpigmente.',
    heroTitle2: 'Filigrane Luxus-Ornamente.',
    heroTitle3: 'Haute-Couture Maniküre.',
    heroSubtitle: 'Dezentrales Maniküre-Netzwerk für meisterhafte Nagelkunst und exklusive Designs. Öffentliche Kunstwerke ohne Verschlüsselung, E2E-verschlüsselter Privatchat, Multiwährungs-Treuhand und Moderation im Freundeskreis.',
    exploreCollection: 'Kollektion Entdecken',
    bookSession: 'Meister-Slot Reservieren',
    liveSwarmP2P: 'P2P-Schwarm Aktiv',

    galleryTitle: 'Öffentliche Haute-Couture-Galerie',
    gallerySubtitle: 'Hochauflösende Maniküre-Sets im offenen P2P-Netzwerk. Nagelkunst ist frei und bedarf keiner Verschlüsselung.',
    allCategories: 'Alle Stilrichtungen',
    bookThisLook: 'Diesen Look Buchen',
    publicArtNote: 'Öffentlicher P2P-Stream · Zensurfrei',

    moderationTitle: 'Inhaltsmoderation durch den Freundeskreis',
    moderationSubtitle: 'Dezentrale Vertrauens-Jury: Freunde und Kollegen stimmen über gemeldete Werke ab und verifizieren echte Handarbeit gegen KI-Plagiate.',
    inviteFriends: 'Freund zur Jury Einladen',
    activeCases: 'Ausstehende Prüfungen',
    voteAuthentic: 'Echte Handarbeit Bestätigen',
    voteFlag: 'Verstoß Melden',
    friendsQuorum: 'Freunde-Quorum: 3 von 5 Stimmen benötigt',
    juryEarnReward: 'Belohnung: +25 $NAIL Bewertungsscore',

    cameraPerm: 'Kamera (Nagelfotografie & Referenz-Scans)',
    notifyPerm: 'Push-Benachrichtigungen (Terminerinnerungen nach 24h & 2h)',
    geoPerm: 'Standort (Meister-Salons in der Nähe finden)',
    storagePerm: 'Lokaler Speicher (Sofortige Offline-Galerieladezeit)',
    grantAll: 'Alle Berechtigungen Erteilen',
    permGranted: 'Erteilt',
    permDenied: 'Verweigert',
    permPrompt: 'Wird angefordert...',

    checkoutTitle: 'Sicherer Multiwährungs-Checkout mit Treuhand',
    smartContractEscrow: 'Smart-Contract-Treuhand-Garantie',
    payWithCrypto: 'Krypto (USDC, ETH, SOL, $NAIL)',
    payWithFiat: 'Karte / Fiat (EUR, USD, GBP)',
    tipArtist: 'Trinkgeld für den Meister',
    confirmPayment: 'Zahlung im Treuhandvertrag Sperren',
    escrowSecured: 'Treuhandbetrag auf der Chain Gesichert',

    e2eEncryptedChat: 'Ende-zu-Ende Verschlüsselter Privatchat',
    typeMessage: 'Nachricht schreiben...',
    sendQuote: 'Kostenvoranschlag Senden',
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
