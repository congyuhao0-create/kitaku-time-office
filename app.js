const state = {
  tab: "home",
  isAuthenticated: false,
  authMode: "login",
  authRole: "parent",
  currentUser: null,
  introDismissed: false,
  scheduleOpen: false,
  scheduleSlotsOpen: true,
  selectedDate: "",
  bookingType: "office",
  selectedPlace: "fujiwaradai",
  selectedStart: "10:00",
  selectedEnd: "12:00",
  balance: 0,
  checkedIn: false,
  modal: null,
  toast: "",
  serviceFilter: "すべて",
  serviceSections: { publish: true, accept: true },
  publishGroup: "こども",
  draftPhoto: null,
  requestedServices: new Set(),
  acceptedServices: new Set(),
  acceptedBackendRequests: new Set(),
  exchangedBenefits: new Set(),
  customRequests: [],
  backendRequests: [],
  backendDraft: {},
  confirmedSlots: new Set(),
  reservedSlots: new Set(),
  activityRecords: [],
  cloud: { enabled: false, realData: false, userId: "", status: "local", lastSync: "", error: "" }
};

const STORAGE_KEY = "kitaku-time-office-state-v3";
const CLOUD_CONFIG_KEY = "kitaku-time-office-supabase-config-v1";
const CLOUD_ROW_ID = "kitaku-main";
let supabaseClient = null;
let supabaseChannel = null;
let realDataChannel = null;
let cloudApplyingRemote = false;
let supabaseCreateClient = null;
const APP_MODE = document.body?.dataset.appMode === "admin" ? "admin" : "user";

const demoUsers = {
  parent: {
    name: "田中 美咲",
    kana: "タナカ ミサキ",
    email: "parent@example.com",
    phone: "090-0000-1111",
    role: "parent",
    roleLabel: "保護者",
    area: "神戸市北区 藤原台",
    household: "4歳・1名",
    emergency: "田中 健 / 090-2222-3333",
    purpose: "仕事席と一時保育の併用",
    verification: { identity: "確認済み", training: "対象外", insurance: "加入済み", childSafety: "同意済み" }
  },
  collaborator: {
    name: "山本 里奈",
    kana: "ヤマモト リナ",
    email: "helper@example.com",
    phone: "090-0000-2222",
    role: "collaborator",
    roleLabel: "地域協力者",
    area: "神戸市北区 有野町",
    household: "子育て経験あり",
    emergency: "山本 大輔 / 090-4444-5555",
    purpose: "読み聞かせ・工作補助",
    verification: { identity: "確認済み", training: "研修済み", insurance: "加入済み", childSafety: "同意済み" }
  },
  operator: {
    name: "北区タイムオフィス事務局",
    kana: "キタク タイムオフィス",
    email: "operator@example.com",
    phone: "078-000-0000",
    role: "operator",
    roleLabel: "運営者",
    area: "藤原台・有野町エリア",
    household: "事務局アカウント",
    emergency: "施設責任者 / 078-000-0001",
    purpose: "予約・本人確認・安全記録の管理",
    verification: { identity: "管理者", training: "管理者", insurance: "確認担当", childSafety: "管理者" }
  }
};

const roleOptions = [
  { id: "parent", label: "保護者", helper: "予約・依頼作成・台帳確認" },
  { id: "collaborator", label: "地域協力者", helper: "研修範囲内のサービス接単" },
  { id: "operator", label: "運営者", helper: "本人確認・予約・安全記録管理" }
];

const bookingPlaces = [
  { id: "fujiwaradai", label: "藤原台コワーキングスペース" },
  { id: "arino", label: "有野町サポートルーム" },
  { id: "hokushin", label: "北神区文化センター連携室" }
];

const bookingTypes = [
  { id: "office", label: "オフィス予約", helper: "作業席・親子共在席・防音ブース" },
  { id: "childcare", label: "保育予約", helper: "一時保育枠・見守りサポート" }
];

const bookingResources = {
  office: [
    { id: "work", label: "ワーク席", capacity: 3, placeIds: ["fujiwaradai", "hokushin"], minStart: "09:00", maxEnd: "18:00" },
    { id: "parent", label: "親子共在席", capacity: 2, placeIds: ["fujiwaradai", "arino"], minStart: "09:00", maxEnd: "17:00" },
    { id: "booth", label: "防音ブース", capacity: 1, placeIds: ["fujiwaradai"], minStart: "10:00", maxEnd: "17:00" },
    { id: "consult", label: "相談席", capacity: 4, placeIds: ["fujiwaradai", "arino", "hokushin"], minStart: "09:00", maxEnd: "18:00" }
  ],
  childcare: [
    { id: "temporary-care", label: "一時保育枠", capacity: 2, placeIds: ["fujiwaradai", "arino"], minStart: "10:00", maxEnd: "16:00" },
    { id: "work-care", label: "ワーク席 + 一時保育", capacity: 2, placeIds: ["fujiwaradai"], minStart: "10:00", maxEnd: "16:00" },
    { id: "watch", label: "こども見守りサポート", capacity: 1, placeIds: ["arino"], minStart: "13:00", maxEnd: "17:00" }
  ]
};

const timeChoices = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00"
];

const services = [
  { id: "read", group: "こども", title: "読み聞かせ", time: "60分 / 1.0時間", slot: "13:30 - 15:30", rule: "研修済みのみ", detail: "3〜6歳の少人数に絵本を読む活動です。保育スタッフの監督下で行います。", icon: "book", tone: "mint" },
  { id: "craft", group: "こども", title: "工作サポート", time: "90分 / 1.5時間", slot: "13:30 - 15:30", rule: "スタッフ監督", detail: "材料準備、片付け、道具の受け渡しを補助します。刃物管理はスタッフ担当です。", icon: "heart", tone: "amber" },
  { id: "move", group: "サポート", title: "運動補助", time: "60分 / 1.0時間", slot: "16:00 - 17:00", rule: "屋内活動", detail: "室内の軽い身体活動を補助します。転倒や体調不良はスタッフへ即時共有します。", icon: "users", tone: "blue" },
  { id: "it", group: "学び", title: "IT相談", time: "45分 / 0.75時間", slot: "17:00 - 18:00", rule: "保護者向け", detail: "スマートフォン設定、オンライン申請、写真整理などを地域参加者が支援します。", icon: "settings", tone: "violet" }
];

const serviceProfiles = {
  read: { person: "田中 美咲", place: "あそび子育てサポートルーム", content: "4歳児向けに絵本を2〜3冊読み、終わった後の片付けまで補助します。保育スタッフが同室で見守ります。", credit: "1.0", time: "水曜 13:30 - 15:30", photo: "絵本棚と読み聞かせスペースの写真" },
  craft: { person: "山本 里奈", place: "藤原台ワークラウンジ", content: "紙、のり、色鉛筆を使う工作の準備と片付けを手伝ってください。刃物や小物管理はスタッフが行います。", credit: "1.5", time: "金曜 13:30 - 15:30", photo: "工作材料セットの写真" },
  move: { person: "佐藤 健", place: "有野町サポートルーム", content: "室内でできる軽い運動遊びの補助です。体調変化があればすぐスタッフへ共有します。", credit: "1.0", time: "火曜 16:00 - 17:00", photo: "活動マットと安全スペースの写真" },
  it: { person: "中村 彩", place: "藤原台コワーキングスペース", content: "保護者向けにスマホ設定、オンライン申請、写真整理を一緒に進めます。個人情報入力は本人が行います。", credit: "0.75", time: "木曜 17:00 - 18:00", photo: "相談席と端末スタンドの写真" }
};

const partnerBenefits = [
  {
    id: "cleaning",
    title: "ベランダ高圧洗浄 2,000円OFF",
    partner: "高圧洗浄サービス W.P.C.",
    area: "藤原台から1.2km",
    cost: 2,
    category: "住まい",
    accent: "blue",
    visual: "清掃",
    detail: "子育て世帯の家事負担を下げる地域協力クーポンです。予約後、店舗で時間通貨交換画面を提示します。"
  },
  {
    id: "clinic",
    title: "自費ケア 660円OFF",
    partner: "リカバリースポーツ鍼灸",
    area: "岡場駅周辺",
    cost: 1.5,
    category: "健康",
    accent: "red",
    visual: "660円OFF",
    detail: "産後ケア、肩こり相談などの自費メニューで使えます。医療行為の予約ではなく、店舗特典として管理します。"
  },
  {
    id: "cafe",
    title: "親子カフェ ドリンク1杯",
    partner: "Fujiwara Kids Cafe",
    area: "藤原台から0.6km",
    cost: 1,
    category: "休憩",
    accent: "amber",
    visual: "CAFE",
    detail: "仕事席や一時保育後の親子休憩に使える地域特典です。安全記録とは分けて台帳に保存します。"
  },
  {
    id: "bookstore",
    title: "絵本購入 10%OFF",
    partner: "有野まちの本棚",
    area: "有野町エリア",
    cost: 0.75,
    category: "学び",
    accent: "green",
    visual: "BOOK",
    detail: "読み聞かせ活動とつながる地域店舗特典です。交換後、店頭でクーポンコードを確認します。"
  }
];

const notices = [
  ["保険の更新手続きのお願い", "2025/05/20", "重要", "danger"],
  ["6月のコワーキング予約を開始しました", "2025/05/18", "お知らせ", "info"],
  ["安全研修の追加日程を公開しました", "2025/05/16", "研修", "ok"]
];

const safetyRules = ["引渡し", "排泄", "授乳", "午睡", "事故対応"];
const mapUrl = "https://www.google.com/maps/search/?api=1&query=%E7%A5%9E%E6%88%B8%E5%B8%82%E5%8C%97%E5%8C%BA%20%E8%97%A4%E5%8E%9F%E5%8F%B0%20%E6%9C%89%E9%87%8E%E7%94%BA";

function hydrateState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved) return;
    Object.assign(state, saved, {
      requestedServices: new Set(saved.requestedServices || []),
      acceptedServices: new Set(saved.acceptedServices || []),
      acceptedBackendRequests: new Set(saved.acceptedBackendRequests || []),
      exchangedBenefits: new Set(saved.exchangedBenefits || []),
      confirmedSlots: new Set(saved.confirmedSlots || []),
      reservedSlots: new Set(saved.reservedSlots || []),
      customRequests: saved.customRequests || [],
      backendRequests: saved.backendRequests || [],
      backendDraft: saved.backendDraft || {},
      activityRecords: saved.activityRecords || [],
      draftPhoto: null,
      toast: "",
      modal: null,
      cloud: { ...state.cloud, ...(saved.cloud || {}) },
      checkedIn: Boolean(saved.checkedIn)
    });
  } catch (error) {
    console.warn("Saved state could not be loaded", error);
  }
}

function saveState() {
  try {
    const snapshot = localSnapshot();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("State could not be saved", error);
  }
}

function localSnapshot() {
  return {
    ...state,
    requestedServices: [...state.requestedServices],
    acceptedServices: [...state.acceptedServices],
    acceptedBackendRequests: [...state.acceptedBackendRequests],
    exchangedBenefits: [...state.exchangedBenefits],
    confirmedSlots: [...state.confirmedSlots],
    reservedSlots: [...state.reservedSlots],
    draftPhoto: null,
    toast: "",
    modal: null,
    cloud: { ...state.cloud, error: "" }
  };
}

function cloudSnapshot() {
  return {
    balance: state.balance,
    checkedIn: state.checkedIn,
    requestedServices: [...state.requestedServices],
    acceptedServices: [...state.acceptedServices],
    acceptedBackendRequests: [...state.acceptedBackendRequests],
    exchangedBenefits: [...state.exchangedBenefits],
    customRequests: state.customRequests,
    backendRequests: state.backendRequests,
    confirmedSlots: [...state.confirmedSlots],
    reservedSlots: [...state.reservedSlots],
    activityRecords: state.activityRecords,
    updatedAt: new Date().toISOString()
  };
}

function applyCloudSnapshot(payload) {
  if (!payload) return;
  cloudApplyingRemote = true;
  Object.assign(state, {
    balance: Number(payload.balance || 0),
    checkedIn: Boolean(payload.checkedIn),
    requestedServices: new Set(payload.requestedServices || []),
    acceptedServices: new Set(payload.acceptedServices || []),
    acceptedBackendRequests: new Set(payload.acceptedBackendRequests || []),
    exchangedBenefits: new Set(payload.exchangedBenefits || []),
    customRequests: payload.customRequests || [],
    backendRequests: payload.backendRequests || [],
    confirmedSlots: new Set(payload.confirmedSlots || []),
    reservedSlots: new Set(payload.reservedSlots || []),
    activityRecords: payload.activityRecords || []
  });
  cloudApplyingRemote = false;
}

function loadCloudConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY) || "null");
    return saved || window.KITAKU_SUPABASE_CONFIG || null;
  } catch {
    return window.KITAKU_SUPABASE_CONFIG || null;
  }
}

function saveCloudConfig(config) {
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(config));
}

function removeCloudConfig() {
  localStorage.removeItem(CLOUD_CONFIG_KEY);
}

async function initCloudFromConfig({ silent = true } = {}) {
  const config = loadCloudConfig();
  if (!config?.url || !config?.anonKey) {
    state.cloud = { enabled: false, status: "local", lastSync: "", error: "" };
    if (!silent) update({ modal: "cloud-config-missing", toast: "Supabase設定が必要です" });
    return false;
  }
  state.cloud = { ...state.cloud, enabled: true, status: "connecting", lastSync: state.cloud.lastSync || "", error: "" };
  render();
  try {
    const createClient = await getSupabaseCreateClient();
    supabaseClient = createClient(config.url, config.anonKey);
    await pullCloudState();
    subscribeCloudState();
    await initAuthSession();
    if (state.cloud.userId) {
      await pullRealDataState();
      subscribeRealDataTables();
    }
    state.cloud = { ...state.cloud, enabled: true, status: "connected", lastSync: formatDateTime(jstNow()), error: "" };
    saveState();
    render();
    return true;
  } catch (error) {
    state.cloud = { ...state.cloud, enabled: false, status: "error", lastSync: "", error: error.message || "Supabase connection failed" };
    render();
    return false;
  }
}

async function getSupabaseCreateClient() {
  if (supabaseCreateClient) return supabaseCreateClient;
  if (window.supabase?.createClient) {
    supabaseCreateClient = window.supabase.createClient;
    return supabaseCreateClient;
  }
  const module = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  supabaseCreateClient = module.createClient;
  return supabaseCreateClient;
}

async function pullCloudState() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("time_office_snapshots")
    .select("payload")
    .eq("id", CLOUD_ROW_ID)
    .maybeSingle();
  if (error) throw error;
  if (data?.payload) {
    applyCloudSnapshot(data.payload);
    saveState();
  } else {
    await pushCloudState();
  }
}

async function pushCloudState() {
  if (!supabaseClient || cloudApplyingRemote) return;
  const { error } = await supabaseClient
    .from("time_office_snapshots")
    .upsert({
      id: CLOUD_ROW_ID,
      payload: cloudSnapshot(),
      updated_at: new Date().toISOString()
    });
  if (error) throw error;
  state.cloud = { enabled: true, status: "connected", lastSync: formatDateTime(jstNow()), error: "" };
}

function scheduleCloudSave() {
  if (!supabaseClient || !state.cloud.enabled || cloudApplyingRemote) return;
  pushCloudState()
    .then(() => render())
    .catch((error) => {
      state.cloud = { enabled: false, status: "error", lastSync: state.cloud.lastSync || "", error: error.message || "Cloud save failed" };
      render();
    });
}

function subscribeCloudState() {
  if (!supabaseClient) return;
  if (supabaseChannel) supabaseClient.removeChannel(supabaseChannel);
  supabaseChannel = supabaseClient
    .channel("time-office-snapshot")
    .on("postgres_changes", { event: "*", schema: "public", table: "time_office_snapshots", filter: `id=eq.${CLOUD_ROW_ID}` }, (payload) => {
      if (payload.new?.payload) {
        applyCloudSnapshot(payload.new.payload);
        state.cloud = { enabled: true, status: "connected", lastSync: formatDateTime(jstNow()), error: "" };
        saveState();
        render();
      }
    })
    .subscribe();
}

async function initAuthSession() {
  if (!supabaseClient?.auth) return;
  const { data } = await supabaseClient.auth.getSession();
  const user = data?.session?.user;
  if (!user) {
    state.cloud = { ...state.cloud, realData: false, userId: "" };
    return;
  }
  state.cloud = { ...state.cloud, realData: true, userId: user.id };
  await loadCloudProfile(user);
}

async function loadCloudProfile(user) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;
  state.currentUser = profileToCurrentUser(data, user.email);
  state.isAuthenticated = true;
}

function profileToCurrentUser(profile, email) {
  const role = roleOptions.find((item) => item.id === profile.role) || roleOptions[0];
  return {
    name: profile.display_name,
    kana: profile.kana || "",
    email: profile.email || email || "",
    phone: profile.phone || "",
    role: profile.role,
    roleLabel: role.label,
    area: profile.area || "",
    household: profile.household || "",
    emergency: profile.emergency_contact || "",
    purpose: profile.purpose || "",
    verification: profile.verification || initialVerification(profile.role)
  };
}

function realDataReady() {
  return Boolean(supabaseClient && state.cloud.realData && state.cloud.userId);
}

async function pullRealDataState() {
  if (!realDataReady()) return;
  try {
    const [bookingsResult, requestsResult, ledgerResult] = await Promise.all([
      supabaseClient.from("bookings").select("*").order("created_at", { ascending: false }),
      supabaseClient.from("service_requests").select("*").order("created_at", { ascending: false }),
      supabaseClient.from("time_ledger").select("*").order("created_at", { ascending: false })
    ]);
    if (bookingsResult.error) throw bookingsResult.error;
    if (requestsResult.error) throw requestsResult.error;
    if (ledgerResult.error) throw ledgerResult.error;
    applyBookingsRows(bookingsResult.data || []);
    applyServiceRequestRows(requestsResult.data || []);
    applyLedgerRows(ledgerResult.data || []);
    state.cloud = { ...state.cloud, realData: true, status: "connected", lastSync: formatDateTime(jstNow()), error: "" };
    saveState();
    render();
  } catch (error) {
    state.cloud = { ...state.cloud, status: "error", error: error.message || "Real data sync failed" };
    saveState();
    render();
  }
}

function applyBookingsRows(rows) {
  state.reservedSlots = new Set(rows.filter((row) => row.status === "pending").map((row) => row.booking_key));
  state.confirmedSlots = new Set(rows.filter((row) => row.status === "confirmed").map((row) => row.booking_key));
}

function applyServiceRequestRows(rows) {
  const isOperator = state.currentUser?.role === "operator";
  state.backendRequests = rows
    .filter((row) => row.source === "operator")
    .map(serviceRequestRowToBackend);
  state.customRequests = rows
    .filter((row) => row.source === "user" && (isOperator || row.owner_id === state.cloud.userId))
    .map(serviceRequestRowToCustom);
  state.requestedServices = new Set(rows
    .filter((row) => row.source === "template" && row.owner_id === state.cloud.userId && row.status === "open")
    .map((row) => services.find((service) => service.title === row.title)?.id)
    .filter(Boolean));
  state.acceptedServices = new Set(rows
    .filter((row) => row.source === "template" && row.accepted_by === state.cloud.userId && row.status === "accepted")
    .map((row) => services.find((service) => service.title === row.title)?.id)
    .filter(Boolean));
  state.acceptedBackendRequests = new Set(rows
    .filter((row) => row.source === "operator" && row.status === "accepted" && (isOperator || row.accepted_by === state.cloud.userId))
    .map((row) => row.id));
}

function serviceRequestRowToBackend(row) {
  return {
    id: row.id,
    title: row.title,
    person: row.person || "事務局",
    place: row.place || "藤原台コワーキングスペース",
    group: row.category || "こども",
    time: row.desired_time || "日時調整中",
    credit: String(row.credit || 1),
    content: row.content || "",
    status: ["closed", "cancelled", "completed"].includes(row.status) ? "closed" : "open",
    createdAt: formatDate(new Date(row.created_at || Date.now()))
  };
}

function serviceRequestRowToCustom(row) {
  return {
    id: row.id,
    person: row.person || "",
    place: row.place || "",
    title: row.title || "",
    content: row.content || "",
    credit: String(row.credit || 0),
    time: row.desired_time || "日時調整中",
    photoName: row.photo_name || "写真未添付",
    group: row.category || "こども",
    photoDataUrl: row.photo_data_url || ""
  };
}

function applyLedgerRows(rows) {
  state.activityRecords = rows.map((row) => ({
    date: formatShortDate(new Date(row.created_at || Date.now())),
    title: row.title,
    meta: row.meta || row.source_type,
    amount: `${row.amount > 0 ? "+" : ""}${Number(row.amount).toFixed(1)}時間`,
    type: row.amount >= 0 ? "plus" : "minus"
  }));
  state.balance = Number(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(1));
}

function subscribeRealDataTables() {
  if (!supabaseClient) return;
  if (realDataChannel) supabaseClient.removeChannel(realDataChannel);
  realDataChannel = supabaseClient
    .channel("time-office-real-data")
    .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, pullRealDataState)
    .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, pullRealDataState)
    .on("postgres_changes", { event: "*", schema: "public", table: "time_ledger" }, pullRealDataState)
    .on("postgres_changes", { event: "*", schema: "public", table: "safety_records" }, pullRealDataState)
    .subscribe();
}

function ensureBookingDefaults() {
  const dates = bookingDateOptions();
  const current = dates.find((date) => date.iso === state.selectedDate);
  if (!current || !current.bookable) state.selectedDate = dates[0].iso;
  if (minutes(state.selectedEnd) <= minutes(state.selectedStart)) {
    state.selectedEnd = nextTimeAfter(state.selectedStart);
  }
}

function bookingDateOptions() {
  const today = startOfDay(jstNow());
  return Array.from({ length: 14 }, (_, index) => {
    const date = addDays(today, index);
    const iso = toDateOnly(date);
    return {
      iso,
      label: `${date.getDate()}(${weekdayJa(date)})`,
      monthLabel: `${date.getFullYear()}年${date.getMonth() + 1}月`,
      bookable: index < 7,
      note: index === 0 ? "今日" : index < 7 ? "予約可" : "選択不可"
    };
  });
}

function selectedDateLabel() {
  return bookingDateOptions().find((date) => date.iso === state.selectedDate)?.label || "";
}

function selectedMonthLabel() {
  return bookingDateOptions().find((date) => date.iso === state.selectedDate)?.monthLabel || "";
}

function jstNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const target = new Date(date);
  target.setDate(target.getDate() + days);
  return target;
}

function toDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekdayJa(date) {
  return ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
}

function availableBookingSlots() {
  return availableResources().map((resource) => resourceSlot(resource));
}

function availableResources() {
  return bookingResources[state.bookingType]
    .filter((resource) => resource.placeIds.includes(state.selectedPlace))
    .filter((resource) => withinResourceTime(resource, state.selectedStart, state.selectedEnd))
    .map((resource) => ({ ...resource, remaining: remainingSeats(resource, state.selectedDate, state.selectedStart, state.selectedEnd) }))
    .filter((resource) => resource.remaining > 0);
}

function resourceSlot(resource) {
  return {
    id: slotKey(resource.id),
    type: state.bookingType,
    time: `${state.selectedStart} - ${state.selectedEnd}`,
    label: resource.label,
    place: placeLabel(state.selectedPlace),
    dateLabel: selectedDateLabel(),
    seats: `残り ${resource.remaining}`,
    remaining: resource.remaining
  };
}

function bookingFromKey(key) {
  const parsed = parseSlotKey(key);
  if (!parsed) return null;
  const resource = findResource(parsed.resourceId, parsed.type);
  if (!resource) return null;
  return {
    id: key,
    type: parsed.type,
    time: `${parsed.start} - ${parsed.end}`,
    label: resource.label,
    place: placeLabel(parsed.placeId),
    dateLabel: dateLabelFromIso(parsed.date),
    seats: `残り ${remainingSeats(resource, parsed.date, parsed.start, parsed.end, parsed.type, parsed.placeId)}`
  };
}

function slotKey(resourceId) {
  return [state.selectedDate, state.bookingType, state.selectedPlace, resourceId, state.selectedStart, state.selectedEnd].join("|");
}

function parseSlotKey(key) {
  const [date, type, placeId, resourceId, start, end] = key.split("|");
  if (!date || !type || !placeId || !resourceId || !start || !end) return null;
  return { date, type, placeId, resourceId, start, end };
}

function findResource(resourceId, type = state.bookingType) {
  return bookingResources[type]?.find((resource) => resource.id === resourceId);
}

function placeLabel(placeId) {
  return bookingPlaces.find((place) => place.id === placeId)?.label || "藤原台コワーキングスペース";
}

function dateLabelFromIso(iso) {
  const date = new Date(`${iso}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}(${weekdayJa(date)})`;
}

function remainingSeats(resource, date, start, end, type = state.bookingType, placeId = state.selectedPlace) {
  const used = [...state.confirmedSlots, ...state.reservedSlots].filter((key) => {
    const parsed = parseSlotKey(key);
    return parsed
      && parsed.date === date
      && parsed.type === type
      && parsed.placeId === placeId
      && parsed.resourceId === resource.id
      && rangesOverlap(start, end, parsed.start, parsed.end);
  }).length;
  return Math.max(resource.capacity - used, 0);
}

function rangesOverlap(startA, endA, startB, endB) {
  return minutes(startA) < minutes(endB) && minutes(startB) < minutes(endA);
}

function withinResourceTime(resource, start, end) {
  return minutes(start) >= minutes(resource.minStart) && minutes(end) <= minutes(resource.maxEnd);
}

function minutes(time) {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

function nextTimeAfter(time) {
  return timeChoices.find((choice) => minutes(choice) > minutes(time)) || timeChoices[timeChoices.length - 1];
}

function noAvailableSlots() {
  return `<button class="empty-state" type="button" data-tab="booking">${icon("calendar")}<span>選択中の日時は満席です。予約画面で別の日付・時間を選んでください。</span></button>`;
}

function render() {
  ensureBookingDefaults();
  document.querySelector("#root").innerHTML = APP_MODE === "admin" ? adminApp() : userApp();
  bindEvents();
}

function userApp() {
  return `
    <div class="app app-user mobile-first">
      <div class="workspace mobile-workspace user-workspace">
        ${phoneShell()}
      </div>
      ${state.toast ? `<div class="toast" role="status">${icon("check")}${state.toast}</div>` : ""}
      ${state.modal ? modalView() : ""}
    </div>
  `;
}

function adminApp() {
  return `
    <div class="app app-admin">
      <header class="top-strip admin-top">
        <div>${logo()}<div><strong>Kitaku Time Office Admin</strong><span>予約・サービス・台帳・安全記録を管理</span></div></div>
        <div class="admin-top-actions">
          <a href="./" class="admin-link-button">${icon("home")}利用者アプリ</a>
          ${state.isAuthenticated ? `<button type="button" data-logout>${icon("lock")}ログアウト</button>` : ""}
        </div>
      </header>
      <div class="admin-workspace">
        ${adminContent()}
      </div>
      ${state.toast ? `<div class="toast" role="status">${icon("check")}${state.toast}</div>` : ""}
      ${state.modal ? modalView() : ""}
    </div>
  `;
}

function adminContent() {
  if (!state.isAuthenticated) {
    return `
      <section class="admin-login-shell admin-login-only">
        ${authScreen()}
        <aside class="admin-login-note">
          <h2>后台は利用者アプリと分離されています</h2>
          <p>予約申請、公開需求、接単、時間台帳、安全記録はここで確認します。運営者アカウントでログインしてください。</p>
        </aside>
      </section>
    `;
  }
  return operatorPreview();
}

function phoneShell() {
  const tabs = [
    ["home", "ホーム", "home"],
    ["services", "さがす", "search"],
    ["booking", "予約", "calendar"],
    ["ledger", "台帳", "file"],
    ["checkin", "チェックイン", "clipboard"],
    ["account", "アカウント", "user"]
  ];
  return `
    <section class="phone-shell" aria-label="スマートフォンアプリ">
      <div class="phone-top"><span>9:41</span><span class="phone-dots">●●●</span></div>
      <header class="mobile-header">
        <div class="mobile-brand">${logo()}<div><strong>Kitaku Time Office</strong><span>${state.isAuthenticated ? `${state.currentUser.roleLabel}・${state.currentUser.area}` : "北区でつながる、時間のたすけあい"}</span></div></div>
        <button class="round-action" type="button" aria-label="${state.isAuthenticated ? "通知" : "ログイン"}" ${state.isAuthenticated ? 'data-modal="notices"' : 'data-auth-mode="login"'}>${icon(state.isAuthenticated ? "bell" : "lock")}</button>
      </header>
      <main class="mobile-content">${currentScreen()}</main>
      <nav class="bottom-nav" aria-label="主要ナビゲーション">
        ${state.isAuthenticated
          ? tabs.map(([key, label, glyph]) => `<button class="${state.tab === key ? "selected" : ""}" type="button" data-tab="${key}">${icon(glyph)}<span>${label}</span></button>`).join("")
          : `<button class="${state.authMode === "login" ? "selected" : ""}" type="button" data-auth-mode="login">${icon("lock")}<span>ログイン</span></button><button class="${state.authMode === "register" ? "selected" : ""}" type="button" data-auth-mode="register">${icon("user")}<span>新規登録</span></button>`}
      </nav>
    </section>
  `;
}

function currentScreen() {
  if (!state.isAuthenticated) return authScreen();
  if (state.tab === "services") return servicesScreen();
  if (state.tab === "publish") return publishServiceScreen();
  if (state.tab === "booking") return bookingScreen();
  if (state.tab === "ledger") return ledgerScreen();
  if (state.tab === "checkin") return checkinScreen();
  if (state.tab === "account") return accountScreen();
  return homeScreen();
}

function authScreen() {
  const isRegister = state.authMode === "register";
  return `
    <div class="screen-flow auth-flow">
      ${screenTitle(isRegister ? "新規登録" : "ログイン", isRegister ? "共有オフィス内の時間銀行を安全に使うため、利用者情報と役割を登録します。" : "登録済みのアカウントで予約、サービス交換、台帳を確認します。")}
      <section class="auth-card">
        <div class="auth-tabs">
          <button class="${!isRegister ? "selected" : ""}" type="button" data-auth-mode="login">ログイン</button>
          <button class="${isRegister ? "selected" : ""}" type="button" data-auth-mode="register">新規登録</button>
        </div>
        ${isRegister ? registerForm() : loginForm()}
      </section>
      <section class="auth-demo">
        <div class="section-line"><h2>体験ログイン</h2><span>デモ用</span></div>
        <div class="demo-grid">
          ${roleOptions.map((role) => `<button type="button" data-demo-login="${role.id}"><strong>${role.label}</strong><span>${role.helper}</span></button>`).join("")}
        </div>
      </section>
      <section class="boundary-panel"><h3>登録で確認する情報</h3><p>論文調査で扱った利用圏、利用者属性、托児交接、安全管理、予約満員・取消対応をアカウント情報と分けて管理します。</p></section>
    </div>
  `;
}

function loginForm() {
  return `
    <div class="auth-form" data-login-form>
      <label class="select-field"><span>メールアドレス</span><input class="modal-input" name="email" type="email" value="parent@example.com" autocomplete="email" /></label>
      <label class="select-field"><span>パスワード</span><input class="modal-input" name="password" type="password" value="kitaku-demo" autocomplete="current-password" /></label>
      <button class="primary-button" type="button" data-login-submit>ログイン</button>
      <button class="secondary-button" type="button" data-auth-mode="register">はじめて利用する方はこちら</button>
    </div>
  `;
}

function registerForm() {
  return `
    <div class="auth-form" data-register-form>
      <div class="role-picker">${roleOptions.map((role) => `<button class="${state.authRole === role.id ? "selected" : ""}" type="button" data-auth-role="${role.id}"><strong>${role.label}</strong><span>${role.helper}</span></button>`).join("")}</div>
      <div class="field-grid">
        <label class="select-field"><span>氏名</span><input class="modal-input" name="name" placeholder="例：田中 美咲" /></label>
        <label class="select-field"><span>フリガナ</span><input class="modal-input" name="kana" placeholder="例：タナカ ミサキ" /></label>
      </div>
      <label class="select-field"><span>メールアドレス</span><input class="modal-input" name="email" type="email" placeholder="例：name@example.com" /></label>
      <label class="select-field"><span>パスワード</span><input class="modal-input" name="password" type="password" placeholder="8文字以上" autocomplete="new-password" /></label>
      <label class="select-field"><span>電話番号</span><input class="modal-input" name="phone" inputmode="tel" placeholder="例：090-0000-0000" /></label>
      <label class="select-field"><span>生活圏・利用エリア</span><select name="area"><option>神戸市北区 藤原台</option><option>神戸市北区 有野町</option><option>神戸市北区 岡場周辺</option><option>その他・相談</option></select></label>
      <label class="select-field"><span>${state.authRole === "parent" ? "子どもの年齢・人数" : "経験・担当可能範囲"}</span><input class="modal-input" name="household" placeholder="${state.authRole === "parent" ? "例：4歳・1名" : "例：読み聞かせ、工作補助"}" /></label>
      <label class="select-field"><span>緊急連絡先</span><input class="modal-input" name="emergency" placeholder="例：氏名 / 電話番号" /></label>
      <label class="select-field"><span>利用目的</span><textarea class="modal-input textarea-input" name="purpose" placeholder="仕事席、一時保育、地域協力、運営管理など"></textarea></label>
      <label class="check-line"><input type="checkbox" name="consent" /> <span>安全ルール、個人情報の取扱い、専門保育との境界に同意します</span></label>
      <button class="primary-button" type="button" data-register-submit>登録して開始</button>
    </div>
  `;
}

function accountScreen() {
  const user = state.currentUser;
  return `
    <div class="screen-flow">
      ${screenTitle("アカウント", "本人確認、利用者属性、安全条件をここで管理します。")}
      <section class="profile-card">
        <div class="profile-avatar">${user.name.slice(0, 1)}</div>
        <div><h2>${user.name}</h2><p>${user.roleLabel}・${user.area}</p><span>${user.email}</span></div>
      </section>
      <section class="panel account-panel">
        <div class="section-line"><h2>登録情報</h2><button type="button" data-modal="profile-edit">編集</button></div>
        <dl>
          <dt>電話番号</dt><dd>${user.phone}</dd>
          <dt>${user.role === "parent" ? "子ども情報" : "経験・範囲"}</dt><dd>${user.household}</dd>
          <dt>緊急連絡先</dt><dd>${user.emergency}</dd>
          <dt>利用目的</dt><dd>${user.purpose}</dd>
        </dl>
      </section>
      <section class="panel account-panel">
        <div class="section-line"><h2>確認ステータス</h2><button type="button" data-modal="verification">詳細</button></div>
        <div class="status-grid">
          ${statusItem("本人確認", user.verification.identity)}
          ${statusItem("安全研修", user.verification.training)}
          ${statusItem("保険", user.verification.insurance)}
          ${statusItem("子ども安全同意", user.verification.childSafety)}
        </div>
      </section>
      <section class="panel account-panel">
        <div class="section-line"><h2>権限</h2><span>${user.roleLabel}</span></div>
        <p>${roleDescription(user.role)}</p>
      </section>
      <button class="secondary-button" type="button" data-logout>ログアウト</button>
    </div>
  `;
}

function statusItem(label, value) {
  const tone = value.includes("済") || value.includes("管理") ? "ok" : value.includes("確認") ? "info" : "warn";
  return `<button type="button" data-modal="status:${label}"><span>${label}</span>${pill(value, tone)}</button>`;
}

function roleDescription(role) {
  if (role === "operator") return "全予約、本人確認、研修・保険状態、安全記録、時間台帳の監査を確認できます。";
  if (role === "collaborator") return "本人確認・研修・保険の範囲内で、地域サービスの接単と活動記録を利用できます。";
  return "オフィス・保育予約、サービス依頼作成、時間台帳と安全記録の確認ができます。";
}

function homeScreen() {
  const bookings = currentBookings();
  const dateLabel = selectedDateLabel();
  return `
    <div class="screen-flow">
      <a class="location-row" href="${mapUrl}" target="_blank" rel="noopener noreferrer">${icon("map")}<span>神戸市北区 藤原台・有野町エリア</span></a>
      <section class="panel today-panel">
        <button class="today-toggle" type="button" data-toggle-schedule aria-expanded="${state.scheduleOpen}">
          <div><h2>本日の予約</h2><span>${dateLabel} / 予約可能時間を確認</span></div>
          <strong>${bookedCount()}件</strong>
          <i class="${state.scheduleOpen ? "open" : ""}">${icon("chevron")}</i>
        </button>
        ${state.scheduleOpen ? `<div class="booking-list">${bookingList(bookings)}</div>${schedulePanel()}` : todayCollapsedSummary(bookings)}
      </section>
      ${balanceCard()}
      <section>
        <div class="section-line"><h2>クイックメニュー</h2></div>
        <div class="quick-grid">
          ${quickButton("services", "heart", "サービス交換")}
          ${quickButton("booking", "calendar", "予約")}
          ${quickButton("ledger", "file", "台帳")}
          ${quickButton("checkin", "clipboard", "チェックイン")}
        </div>
      </section>
      <section class="notice-list">
        <div class="section-line"><h2>お知らせ</h2><button type="button" data-modal="notices">すべて見る</button></div>
        ${notices.slice(0, 2).map(([title, date, label, tone]) => noticeRow(title, date, label, tone)).join("")}
      </section>
    </div>
  `;
}

function schedulePanel() {
  const slots = availableBookingSlots();
  const countLabel = slots.length ? `${slots.length}席` : "空きなし";
  return `
    <div class="schedule-panel">
      <div class="schedule-head">
        <button class="schedule-toggle" type="button" data-toggle-slot-schedule aria-expanded="${state.scheduleSlotsOpen}">
          <div><span>当日の予約時間</span><small>${selectedDateLabel()} ${state.selectedStart} - ${state.selectedEnd} / ${countLabel}</small></div>
          <i class="${state.scheduleSlotsOpen ? "open" : ""}">${icon("chevron")}</i>
        </button>
        <button type="button" data-tab="booking">詳しく予約</button>
      </div>
      ${state.scheduleSlotsOpen ? (slots.length ? slots.map(slotRow).join("") : noAvailableSlots()) : `<button class="empty-state schedule-collapsed" type="button" data-toggle-slot-schedule>${icon("calendar")}<span>${countLabel}です。タップして展開します。</span></button>`}
    </div>
  `;
}

function todayCollapsedSummary(bookings) {
  if (!bookings.length) {
    return `<button class="empty-state booking-empty" type="button" data-toggle-schedule>${icon("calendar")}<span>予約はまだありません。小三角から当日の時間を確認できます。</span></button>`;
  }
  return `<button class="empty-state booking-empty collapsed-summary" type="button" data-toggle-schedule>${icon("calendar")}<span>${bookings.length}件の予約があります。タップして展開します。</span></button>`;
}

function bookingList(bookings = currentBookings()) {
  if (!bookings.length) {
    return `<button class="empty-state booking-empty" type="button" data-toggle-schedule>${icon("calendar")}<span>予約はまだありません。小三角から当日の時間を確認できます。</span></button>`;
  }
  return bookings.map(bookingRow).join("");
}

function slotRow(slot) {
  const isConfirmed = state.confirmedSlots.has(slot.id);
  const isReserved = state.reservedSlots.has(slot.id);
  const statusText = isConfirmed ? "確定済み" : isReserved ? "予約申請済み" : slot.seats;
  return `
    <article class="slot-row ${isConfirmed ? "is-confirmed" : ""} ${isReserved ? "is-reserved" : ""}">
      <button class="slot-main" type="button" data-slot-detail="${slot.id}">
        <time>${slot.time}</time>
        <div><strong>${slot.label}</strong><span>${slot.place} / ${statusText}</span></div>
      </button>
      <div class="slot-actions">
        ${isConfirmed ? `<button type="button" data-slot-detail="${slot.id}">詳細</button><button type="button" data-slot-cancel="${slot.id}">取消</button>` : ""}
        ${isReserved ? `<button type="button" data-slot-confirm="${slot.id}">確定</button><button type="button" data-slot-cancel="${slot.id}">取消</button>` : ""}
        ${!isConfirmed && !isReserved ? `<button type="button" data-slot-confirm="${slot.id}">確定</button><button type="button" data-slot-reserve="${slot.id}">予約</button>` : ""}
      </div>
    </article>
  `;
}

function currentBookings() {
  const slotBookings = [...new Set([...state.confirmedSlots, ...state.reservedSlots])]
    .map(bookingFromKey)
    .filter(Boolean)
    .map((slot) => ({
      kind: "slot",
      id: slot.id,
      time: slot.time,
      title: slot.label,
      place: `${slot.dateLabel} / ${slot.place}`,
      status: state.confirmedSlots.has(slot.id) ? "確定" : "調整中",
      tone: state.confirmedSlots.has(slot.id) ? "ok" : "warn"
    }));
  const serviceBookings = [...state.acceptedServices]
    .map((id) => services.find((service) => service.id === id))
    .filter(Boolean)
    .map((service) => ({
      kind: "service",
      id: service.id,
      time: service.slot,
      title: service.title,
      place: "地域サービス交換",
      status: "接単中",
      tone: "info"
    }));
  const backendBookings = [...state.acceptedBackendRequests]
    .map(findBackendRequest)
    .filter(Boolean)
    .map((request) => ({
      kind: "backend",
      id: request.id,
      time: request.time,
      title: request.title,
      place: `${request.place} / 后台公開依頼`,
      status: "接単中",
      tone: "info"
    }));
  return [...slotBookings, ...serviceBookings, ...backendBookings].sort((a, b) => a.time.localeCompare(b.time));
}

function bookingRow(item) {
  const detailButton = item.kind === "service"
    ? `<button class="booking-detail" type="button" data-service-detail="${item.id}:accept">`
    : item.kind === "backend"
    ? `<button class="booking-detail" type="button" data-backend-request-detail="${item.id}">`
    : `<button class="booking-detail" type="button" data-booking-detail="${item.id}">`;
  const cancelButton = item.kind === "service"
    ? `<button type="button" data-cancel-accept-service="${item.id}">取消</button>`
    : item.kind === "backend"
    ? `<button type="button" data-cancel-backend-request="${item.id}">取消</button>`
    : `<button type="button" data-slot-cancel="${item.id}">取消</button>`;
  return `
    <article class="booking-row">
      ${detailButton}
        <div><time>${item.time}</time><h3>${item.title}</h3><p>${item.place}</p></div>
      </button>
      <div class="row-actions">${pill(item.status, item.tone)}${cancelButton}</div>
    </article>
  `;
}

function bookedCount() {
  return state.confirmedSlots.size + state.reservedSlots.size + state.acceptedServices.size + state.acceptedBackendRequests.size;
}

function servicesScreen() {
  const filters = ["すべて", "こども", "サポート", "学び"];
  const visible = state.serviceFilter === "すべて" ? services : services.filter((s) => s.group === state.serviceFilter);
  const visibleCustom = state.serviceFilter === "すべて" ? state.customRequests : state.customRequests.filter((request) => request.group === state.serviceFilter);
  const visibleBackend = state.serviceFilter === "すべて" ? state.backendRequests : state.backendRequests.filter((request) => request.group === state.serviceFilter);
  const acceptCount = visible.length + visibleBackend.filter((request) => request.status !== "closed").length;
  return `
    <div class="screen-flow">
      ${screenTitle("サービス交換", "自分の依頼を公開し、地域の依頼を受けられます。予約枠とは分けて管理します。")}
      <div class="segmented">${filters.map((f) => `<button class="${state.serviceFilter === f ? "selected" : ""}" type="button" data-filter="${f}">${f}</button>`).join("")}</div>
      <section class="service-zone">
        ${serviceZoneHeader("publish", "依頼を出す", visibleCustom.length, `<button type="button" data-tab="publish">仕組み</button>`)}
        ${state.serviceSections.publish ? `<div class="service-list">${visibleCustom.length ? visibleCustom.map(customRequestCard).join("") : emptyPublishedRequests()}</div>` : collapsedServiceSummary("publish", visibleCustom.length)}
      </section>
      <section class="service-zone">
        ${serviceZoneHeader("accept", "依頼を受ける", acceptCount, `<button type="button" data-modal="accept-help">条件</button>`)}
        ${state.serviceSections.accept ? `<div class="service-list">${visibleBackend.map(backendRequestCard).join("")}${visible.map((service) => serviceInfoCard(service, "accept")).join("")}</div>` : collapsedServiceSummary("accept", acceptCount)}
      </section>
      ${benefitExchangeSection()}
      <section class="boundary-panel"><h3>専門保育との境界</h3><p>以下は有資格者・契約スタッフのみが担当します。</p><div>${safetyRules.map((rule) => `<button type="button" data-modal="safety:${rule}">${rule}</button>`).join("")}</div></section>
    </div>
  `;
}

function benefitExchangeSection() {
  return `
    <section class="benefit-zone">
      <div class="benefit-balance">
        <div><span>使える時間通貨</span><strong>${state.balance.toFixed(1)}</strong><small>活動完了後に地域特典へ交換できます</small></div>
        <button type="button" data-tab="ledger">台帳</button>
      </div>
      <div class="section-line"><h2>近くで使える地域クーポン</h2><button type="button" data-modal="benefit-help">すべて見る</button></div>
      <div class="benefit-scroll">${partnerBenefits.map(benefitCard).join("")}</div>
      <button class="benefit-note" type="button" data-modal="benefit-location">${icon("map")}<span>近隣店舗で利用できる特典は、現在地に近い順に表示します</span></button>
    </section>
  `;
}

function benefitCard(benefit) {
  const exchanged = state.exchangedBenefits.has(benefit.id);
  return `
    <article class="benefit-card ${exchanged ? "is-exchanged" : ""}">
      <button class="benefit-main" type="button" data-benefit-detail="${benefit.id}">
        <div class="benefit-visual ${benefit.accent}"><span>${benefit.visual}</span></div>
        <div class="benefit-cost">${icon("ticket")}<strong>${benefit.cost}</strong><span>${exchanged ? "交換済み" : "交換できます"}</span></div>
        <h3>${benefit.title}</h3>
        <p>${benefit.partner}</p>
        <small>${benefit.area}・${benefit.category}</small>
      </button>
      <button type="button" ${exchanged ? `data-benefit-detail="${benefit.id}"` : `data-exchange-benefit="${benefit.id}"`}>${exchanged ? "表示" : "交換"}</button>
    </article>
  `;
}

function serviceZoneHeader(key, title, count, action) {
  const open = state.serviceSections[key];
  return `
    <div class="service-section-head">
      <button class="service-toggle" type="button" data-toggle-service-section="${key}" aria-expanded="${open}">
        <div><h2>${title}</h2><span>${count}件</span></div>
        <i class="${open ? "open" : ""}">${icon("chevron")}</i>
      </button>
      ${action}
    </div>
  `;
}

function collapsedServiceSummary(key, count) {
  const text = count > 0 ? `${count}件あります。タップして展開します。` : "まだありません。タップして作成・確認できます。";
  return `<button class="empty-state service-collapsed" type="button" data-toggle-service-section="${key}">${icon("file")}<span>${text}</span></button>`;
}

function publishServiceScreen() {
  const groups = ["こども", "サポート", "学び"];
  return `
    <div class="screen-flow">
      <div class="section-line"><button type="button" data-tab="services">戻る</button></div>
      ${screenTitle("依頼を作成", "具体的なサービス情報を入力して、地域の協力者に公開します。")}
      <section class="panel publish-form" data-publish-form>
        <label class="select-field"><span>人名</span><input class="modal-input" name="person" placeholder="例：田中 美咲" /></label>
        <label class="select-field"><span>地点</span><input class="modal-input" name="place" placeholder="例：藤原台コワーキングスペース" /></label>
        <label class="select-field"><span>サービス名</span><input class="modal-input" name="title" placeholder="例：絵本の読み聞かせ補助" /></label>
        <div class="select-field"><span>サービスタイプ</span><div class="segmented publish-type-scroll">${groups.map((group) => `<button class="${state.publishGroup === group ? "selected" : ""}" type="button" data-publish-group="${group}">${group}</button>`).join("")}</div></div>
        <label class="select-field"><span>サービス内容</span><textarea class="modal-input textarea-input" name="content" placeholder="対象年齢、必要なサポート、注意点などを入力"></textarea></label>
        <div class="field-grid">
          <label class="select-field"><span>給付時間通貨</span><input class="modal-input" name="credit" type="number" min="0.25" step="0.25" placeholder="1.0" /></label>
          <label class="select-field"><span>希望日時</span><input class="modal-input" name="time" placeholder="例：水曜 13:30" /></label>
        </div>
        <label class="photo-field"><span>${icon("file")}写真を添付</span><input name="photo" type="file" accept="image/*" data-photo-input /><small>活動場所・道具・資料の写真を添付できます</small><div class="photo-preview" data-photo-preview>${state.draftPhoto ? photoPreviewMarkup(state.draftPhoto) : "写真はまだ選択されていません"}</div></label>
        <button class="primary-button" type="button" data-publish-submit>公開する</button>
      </section>
    </div>
  `;
}

function serviceCard(service, mode) {
  const isPublish = mode === "publish";
  const active = isPublish ? state.requestedServices.has(service.id) : state.acceptedServices.has(service.id);
  const action = active
    ? `<button type="button" data-${isPublish ? "cancel-request-service" : "cancel-accept-service"}="${service.id}">取消</button>`
    : `<button type="button" data-${isPublish ? "request-service" : "accept-service"}="${service.id}">${isPublish ? "公開" : "受ける"}</button>`;
  return `
    <article class="service-card ${active ? "is-active" : ""}">
      <button class="service-open" type="button" data-service-detail="${service.id}:${mode}" aria-label="${service.title}を開く"></button>
      <div class="service-icon ${service.tone}">${icon(service.icon)}</div>
      <div><h3>${service.title}</h3><p>${service.time}</p><span>${isPublish ? "依頼として事務局へ公開" : service.rule}</span></div>
      ${action}
    </article>
  `;
}

function serviceInfoCard(service, mode) {
  const profile = serviceProfiles[service.id];
  const active = state.acceptedServices.has(service.id);
  return `
    <article class="service-card custom-request-card ${active ? "is-active" : ""}">
      <button class="custom-card-main" type="button" data-service-detail="${service.id}:${mode}" aria-label="${service.title}を開く">
        <div class="custom-photo-thumb service-template-thumb ${service.tone}">${icon(service.icon)}<span>写真</span></div>
        <div class="custom-card-body">
          <h3>${service.title}</h3>
          <p>${profile.person}・${profile.place}</p>
          <span>${profile.content}</span>
          <small>${service.group} / ${profile.credit}時間 / ${profile.time} / ${profile.photo}</small>
        </div>
      </button>
      ${active ? `<button type="button" data-cancel-accept-service="${service.id}">取消</button>` : `<button type="button" data-accept-service="${service.id}">受ける</button>`}
    </article>
  `;
}

function backendRequestCard(request) {
  const accepted = state.acceptedBackendRequests.has(request.id);
  const closed = request.status === "closed";
  return `
    <article class="service-card custom-request-card backend-request-card ${accepted ? "is-active" : ""} ${closed ? "is-closed" : ""}">
      <button class="custom-card-main" type="button" data-backend-request-detail="${request.id}" aria-label="${request.title}を開く">
        <div class="custom-photo-thumb service-template-thumb blue">${icon("clipboard")}<span>后台</span></div>
        <div class="custom-card-body">
          <h3>${request.title}</h3>
          <p>${request.person}・${request.place}</p>
          <span>${request.content}</span>
          <small>${request.group} / ${request.credit}時間 / ${request.time} / ${request.status === "closed" ? "終了" : "募集中"}</small>
        </div>
      </button>
      ${closed ? `<button type="button" data-backend-request-detail="${request.id}">終了</button>` : accepted ? `<button type="button" data-cancel-backend-request="${request.id}">取消</button>` : `<button type="button" data-accept-backend-request="${request.id}">受ける</button>`}
    </article>
  `;
}

function findBackendRequest(id) {
  return state.backendRequests.find((request) => request.id === id);
}

function emptyPublishedRequests() {
  return `<button class="empty-state published-empty" type="button" data-tab="publish">${icon("file")}<span>公開中の依頼はまだありません。ここから具体的なサービス情報を作成できます。</span></button>`;
}

function customRequestCard(request) {
  return `
    <article class="service-card custom-request-card is-active">
      <button class="custom-card-main" type="button" data-custom-request-detail="${request.id}" aria-label="${request.title}を開く">
        <div class="custom-photo-thumb">${request.photoDataUrl ? `<img src="${request.photoDataUrl}" alt="${request.title}の写真" />` : `${icon("file")}<span>写真</span>`}</div>
        <div class="custom-card-body">
          <h3>${request.title || "サービス名未入力"}</h3>
          <p>${request.person || "人名未入力"}・${request.place || "地点未入力"}</p>
          <span>${request.content || "サービス内容未入力"}</span>
          <small>${request.group || "こども"} / ${request.credit || "0"}時間 / ${request.time || "日時調整中"} / ${request.photoName || "写真未添付"}</small>
        </div>
      </button>
      <button type="button" data-cancel-custom-request="${request.id}">取消</button>
    </article>
  `;
}

function bookingScreen() {
  const dates = bookingDateOptions();
  const endChoices = timeChoices.filter((time) => minutes(time) > minutes(state.selectedStart));
  const slots = availableBookingSlots();
  return `
    <div class="screen-flow">
      ${screenTitle("オフィス・保育予約", "作業席、親子共在席、一時保育枠だけを扱います。")}
      <section class="booking-block">
        <div class="booking-month"><strong>${selectedMonthLabel()}</strong><span>日本時間・今日から7日以内のみ予約可</span></div>
        <div class="date-strip scroll-strip">${dates.map(dateButton).join("")}</div>
      </section>
      <section class="booking-block">
        <div class="booking-type-switch">${bookingTypes.map((type) => `<button class="${state.bookingType === type.id ? "selected" : ""}" type="button" data-booking-type="${type.id}"><strong>${type.label}</strong><span>${type.helper}</span></button>`).join("")}</div>
      </section>
      <label class="select-field"><span>場所を選択</span><select data-place>${bookingPlaces.map((place) => `<option value="${place.id}" ${state.selectedPlace === place.id ? "selected" : ""}>${place.label}</option>`).join("")}</select></label>
      <section class="booking-block">
        <div class="section-line"><h2>開始時間</h2><span>${state.selectedStart}</span></div>
        <div class="time-wheel">${timeChoices.slice(0, -1).map((time) => `<button class="${state.selectedStart === time ? "selected" : ""}" type="button" data-start-time="${time}">${time}</button>`).join("")}</div>
        <div class="section-line"><h2>終了時間</h2><span>${state.selectedEnd}</span></div>
        <div class="time-wheel">${endChoices.map((time) => `<button class="${state.selectedEnd === time ? "selected" : ""}" type="button" data-end-time="${time}">${time}</button>`).join("")}</div>
      </section>
      <div class="schedule-panel always-open">
        <div class="schedule-head booking-result-head"><span>${state.selectedStart} - ${state.selectedEnd} に予約できる席</span><strong>${slots.length}件</strong></div>
        ${slots.length ? slots.map(slotRow).join("") : noAvailableSlots()}
      </div>
      <button class="primary-button" type="button" data-open-schedule-home>本日の予約に反映</button>
    </div>
  `;
}

function dateButton(date) {
  return `<button class="${state.selectedDate === date.iso ? "selected" : ""} ${date.bookable ? "" : "is-disabled"}" type="button" ${date.bookable ? `data-date="${date.iso}"` : "disabled"}><span>${date.label}</span><small>${date.note}</small></button>`;
}

function ledgerScreen() {
  return `
    <div class="screen-flow">
      ${screenTitle("台帳（時間履歴）", "一般ポイントと安全記録は分けて管理します。")}
      ${balanceCard()}
      ${state.activityRecords.length ? `<div class="ledger-list">
        <h3>2025年5月</h3>
        ${state.activityRecords.map((record) => `<button class="ledger-row" type="button" data-ledger="${record.title}"><time>${record.date}</time><div><strong>${record.title}</strong><span>${record.meta}</span></div><b class="${record.type}">${record.amount}</b></button>`).join("")}
      </div>` : `<button class="empty-state" type="button" data-modal="ledger-empty">${icon("wallet")}<span>活動完了後に時間残高と台帳が表示されます</span></button>`}
      <button class="empty-state" type="button" data-modal="expired">${icon("wallet")}<span>凍結・期限切れの履歴はありません</span></button>
    </div>
  `;
}

function checkinScreen() {
  return `
    <div class="screen-flow check-screen">
      ${screenTitle("チェックイン", "施設のQRコードを読み取って開始・終了を確認します。")}
      <button class="qr-box" type="button" data-modal="qr">${icon("qrBig")}</button>
      <span class="or-line">または</span>
      <button class="secondary-button" type="button" data-modal="code">コードを入力</button>
      <section class="panel">
        <div class="panel-title"><h2>現在の状態</h2>${pill(state.checkedIn ? "利用中" : "未開始", state.checkedIn ? "warn" : "ok")}</div>
      </section>
      <button class="primary-button" type="button" data-checkin>${state.checkedIn ? `終了して${pendingCreditAmount().toFixed(1)}時間を記録` : "チェックインする"}</button>
      <p class="success-line">${icon("shield")}時間クレジットは前台確認後に台帳へ反映されます。</p>
    </div>
  `;
}

function operatorPreview() {
  if (!state.isAuthenticated) {
    return operatorLockedPreview("ログイン後に運営者 Dashboard を表示します。", "本人確認、研修、保険、予約状況はアカウント別に管理します。");
  }
  if (state.currentUser.role !== "operator") {
    return operatorLockedPreview("運営者 Dashboard", `${state.currentUser.roleLabel}アカウントでは個人の予約・台帳だけ確認できます。運営者ログインで全体管理を表示します。`);
  }
  const bookingRows = operatorBookingQueue();
  const publishedItems = operatorPublishedItems();
  const acceptedItems = operatorAcceptedItems();
  return `
    <section class="dashboard-shell phone-secondary">
      <main class="dashboard-main">
        <header class="dashboard-header"><div><h1>運営者確認</h1><p>予約、サービス、台帳をリアルタイムに分けて確認します。</p></div></header>
        <div class="metric-grid">
          ${metric("予約申請", String(state.reservedSlots.size), "予約ボタン後", "calendar")}
          ${metric("予約確定", String(state.confirmedSlots.size), "確定ボタン後", "check")}
          ${metric("公開依頼", String(state.requestedServices.size + state.customRequests.length + state.backendRequests.filter((item) => item.status !== "closed").length), "前端と后台の合計", "heart")}
          ${metric("接単中", String(state.acceptedServices.size + state.acceptedBackendRequests.size), "受ける選択後", "users")}
          ${metric("時間残高", state.balance.toFixed(1), "完了確認後", "clipboard")}
          ${metric("事故・苦情", "0", "安全記録は分離", "alert")}
        </div>
        ${operatorDataChecklist()}
        ${backendManagementPanel()}
        <div class="dashboard-grid">
          <section class="dash-panel wide">
            <div class="panel-heading"><h2>予約キュー</h2><button type="button" data-tab="booking">予約を見る</button></div>
            <div class="timeline">${bookingRows.length ? bookingRows.map(operatorTimelineItem).join("") : `<button class="empty-state" type="button" data-tab="booking">${icon("calendar")}<span>予約はまだありません</span></button>`}</div>
          </section>
          <section class="dash-panel">
            <div class="panel-heading"><h2>サービス公開</h2><button type="button" data-tab="services">さがす</button></div>
            <div class="timeline">${publishedItems.length ? publishedItems.map(operatorTimelineItem).join("") : `<button class="empty-state" type="button" data-tab="services">${icon("heart")}<span>公開依頼はまだありません</span></button>`}</div>
          </section>
          <section class="dash-panel">
            <div class="panel-heading"><h2>接単・台帳</h2><button type="button" data-tab="ledger">台帳</button></div>
            <div class="timeline">${acceptedItems.length ? acceptedItems.map(operatorTimelineItem).join("") : `<button class="empty-state" type="button" data-tab="services">${icon("clipboard")}<span>接単・完了記録はまだありません</span></button>`}</div>
          </section>
          <section class="dash-panel">
            <div class="panel-heading"><h2>利用者確認</h2><button type="button" data-modal="operator-users">一覧</button></div>
            <div class="timeline">${operatorUserItems().map(operatorTimelineItem).join("")}</div>
          </section>
          <section class="dash-panel">
            <div class="panel-heading"><h2>安全・事故記録</h2><button type="button" data-modal="operator-safety">記録</button></div>
            <div class="timeline"><button class="timeline-item timeline-button" type="button" data-modal="operator-safety"><span>0件</span><div><strong>事故・苦情なし</strong><small>引渡し、排泄、授乳、午睡、事故対応は一般台帳と分離</small></div></button></div>
          </section>
        </div>
      </main>
    </section>
  `;
}

function operatorDataChecklist() {
  const items = [
    ["利用者", "本人確認・連絡先・子ども情報"],
    ["予約", "日時・席位・保育枠・状態"],
    ["公開需求", "人名・場所・内容・写真・時間通貨"],
    ["接単", "担当者・研修範囲・保険状態"],
    ["前台確認", "開始/終了・現場スタッフ確認"],
    ["台帳", "発生/使用/凍結/期限"],
    ["安全記録", "引渡し・事故・苦情を分離"],
    ["店舗特典", "交換条件・利用履歴"]
  ];
  return `<section class="dash-panel wide operator-data-map"><div class="panel-heading"><h2>后台需要管理的数据</h2><button type="button" data-modal="backend-data-map">查看说明</button></div><div>${items.map(([title, text]) => `<button type="button" data-modal="backend-data:${title}"><strong>${title}</strong><span>${text}</span></button>`).join("")}</div></section>`;
}

function operatorBookingQueue() {
  return currentBookings().map((item) => ({
    ...item,
    key: `${item.kind}:${item.id}`,
    modal: `operator-booking:${item.kind}:${item.id}`,
    small: `${item.place}・${operatorApplicantName(item.kind, item.id)}`
  }));
}

function operatorPublishedItems() {
  const customItems = state.customRequests.map((item) => ({
    key: `custom:${item.id}`,
    modal: `operator-service:custom:${item.id}`,
    status: "公開",
    title: item.title || "公開依頼",
    small: `${item.person || "人名未入力"}・${item.place || "地点未入力"}・${item.credit || "0"}時間`
  }));
  const templateItems = services
    .filter((service) => state.requestedServices.has(service.id))
    .map((service) => {
      const profile = serviceProfiles[service.id];
      return {
        key: `service:${service.id}`,
        modal: `operator-service:service:${service.id}`,
        status: "公開",
        title: service.title,
        small: `${profile.person}・${profile.place}・${profile.credit}時間`
      };
    });
  const backendItems = state.backendRequests
    .filter((item) => item.status !== "closed")
    .map((item) => ({
      key: `backend:${item.id}`,
      modal: `operator-service:backend:${item.id}`,
      status: state.acceptedBackendRequests.has(item.id) ? "接単" : "公開",
      title: item.title,
      small: `${item.person}・${item.place}・${item.credit}時間`
    }));
  return [...customItems, ...templateItems, ...backendItems];
}

function operatorAcceptedItems() {
  const acceptedServices = [...state.acceptedServices]
    .map((id) => services.find((service) => service.id === id))
    .filter(Boolean)
    .map((service) => ({
      key: `service:${service.id}`,
      modal: `operator-service:service:${service.id}:accept`,
      status: "接単",
      title: service.title,
      small: `${serviceProfiles[service.id].person}・${service.rule}`
    }));
  const acceptedBackend = [...state.acceptedBackendRequests]
    .map(findBackendRequest)
    .filter(Boolean)
    .map((item) => ({
      key: `backend:${item.id}`,
      modal: `operator-service:backend:${item.id}:accept`,
      status: "接単",
      title: item.title,
      small: `${item.person}・${item.credit}時間`
    }));
  const ledgerItems = state.activityRecords.map((record, index) => ({
    key: `ledger:${index}`,
    modal: `operator-ledger:${index}`,
    status: "完了",
    title: record.title,
    small: `${record.date}・${record.amount}・${record.meta}`
  }));
  return [...acceptedServices, ...acceptedBackend, ...ledgerItems];
}

function operatorUserItems() {
  return Object.entries(demoUsers).map(([id, user]) => ({
    key: id,
    modal: `operator-user:${id}`,
    status: user.roleLabel,
    title: user.name,
    small: `${user.area}・本人確認 ${user.verification.identity}・保険 ${user.verification.insurance}`
  }));
}

function operatorTimelineItem(item) {
  return `<button class="timeline-item timeline-button" type="button" data-modal="${item.modal}"><span>${item.status}</span><div><strong>${item.time ? `${item.time} ` : ""}${item.title}</strong><small>${item.small || item.place || ""}</small></div></button>`;
}

function operatorApplicantName(kind, id) {
  if (kind === "slot") return demoUsers.parent.name;
  if (kind === "service") {
    const service = services.find((item) => item.id === id);
    return service ? serviceProfiles[service.id].person : "地域協力者";
  }
  if (kind === "backend") {
    return state.currentUser?.role === "operator" ? "接単者確認中" : state.currentUser?.name || "地域協力者";
  }
  return "利用者";
}

function backendManagementPanel() {
  const openBackend = state.backendRequests.filter((item) => item.status !== "closed");
  const acceptedBackend = state.backendRequests.filter((item) => state.acceptedBackendRequests.has(item.id));
  const draft = state.backendDraft || {};
  const cloudConfig = loadCloudConfig() || {};
  return `
    <section class="dash-panel wide backend-console">
      <div class="panel-heading"><h2>后台管理网页</h2><button type="button" data-reset-backend>数据清零</button></div>
      <div class="cloud-panel">
        <div class="cloud-status">
          <div><strong>Supabase 云同步</strong><span>${cloudStatusLabel()}</span></div>
          ${state.cloud.enabled ? pill("在线", "ok") : pill("本地", "warn")}
        </div>
        <div class="cloud-fields" data-cloud-form>
          <label><span>Project URL</span><input class="modal-input" name="url" value="${escapeHtml(cloudConfig.url || "")}" placeholder="https://xxxx.supabase.co" /></label>
          <label><span>Anon / Publishable key</span><input class="modal-input" name="anonKey" value="${escapeHtml(cloudConfig.anonKey || "")}" placeholder="eyJhbGci..." /></label>
          <div class="cloud-actions">
            <button class="primary-button" type="button" data-cloud-connect>连接云数据库</button>
            <button class="secondary-button" type="button" data-cloud-push>立即上传当前数据</button>
            <button class="secondary-button" type="button" data-cloud-disconnect>断开</button>
          </div>
        </div>
      </div>
      <div class="backend-console-grid">
        <div class="backend-form" data-backend-form>
          <label><span>需求标题</span><input class="modal-input" name="title" value="${escapeHtml(draft.title || "")}" placeholder="例：水曜の読み聞かせ補助" /></label>
          <div class="field-grid">
            <label><span>担当/人名</span><input class="modal-input" name="person" value="${escapeHtml(draft.person || "")}" placeholder="事務局" /></label>
            <label><span>地点</span><input class="modal-input" name="place" value="${escapeHtml(draft.place || "")}" placeholder="藤原台コワーキングスペース" /></label>
          </div>
          <div class="field-grid">
            <label><span>类型</span><select name="group"><option ${selectedOption(draft.group, "こども")}>こども</option><option ${selectedOption(draft.group, "サポート")}>サポート</option><option ${selectedOption(draft.group, "学び")}>学び</option></select></label>
            <label><span>给付时间</span><input class="modal-input" name="credit" type="number" min="0.25" step="0.25" value="${escapeHtml(draft.credit || "1.0")}" /></label>
          </div>
          <label><span>希望时间</span><input class="modal-input" name="time" value="${escapeHtml(draft.time || "")}" placeholder="例：水曜 13:30 - 15:30" /></label>
          <label><span>需求内容</span><textarea class="modal-input textarea-input" name="content" placeholder="対象年齢、必要な補助、安全条件など">${escapeHtml(draft.content || "")}</textarea></label>
          <button class="primary-button" type="button" data-backend-publish>前端に公開</button>
        </div>
        <div class="backend-live">
          <h3>前端に同期中</h3>
          <div class="timeline">${openBackend.length ? openBackend.map((item) => `<article class="timeline-item"><span>${state.acceptedBackendRequests.has(item.id) ? "接単" : "公開"}</span><div><strong>${item.title}</strong><small>${item.place}・${item.credit}時間・${item.time}</small></div><button type="button" data-backend-resolve="${item.id}">終了</button></article>`).join("") : `<button class="empty-state" type="button" data-tab="services">${icon("heart")}<span>后台公開の需求はまだありません</span></button>`}</div>
          <h3>接単中</h3>
          <div class="timeline">${acceptedBackend.length ? acceptedBackend.map((item) => `<article class="timeline-item"><span>接単</span><div><strong>${item.title}</strong><small>${item.person}・${item.credit}時間</small></div></article>`).join("") : `<button class="empty-state" type="button" data-tab="services">${icon("users")}<span>接単中の后台需求はまだありません</span></button>`}</div>
        </div>
      </div>
    </section>
  `;
}

function cloudStatusLabel() {
  if (state.cloud.status === "connected") return `已连接，最后同步 ${state.cloud.lastSync || "刚刚"}`;
  if (state.cloud.status === "connecting") return "正在连接 Supabase...";
  if (state.cloud.status === "error") return `连接错误：${state.cloud.error}`;
  if (state.cloud.status === "missing-client") return "Supabase 脚本未载入";
  return "未连接，当前只保存在本机浏览器";
}

function operatorLockedPreview(title, text) {
  return `
    <section class="dashboard-shell phone-secondary dashboard-locked">
      <main class="dashboard-main">
        <header class="dashboard-header"><div><h1>${title}</h1><p>${text}</p></div></header>
        <div class="metric-grid">
          ${metric("予約申請", "0", "ログイン後に集計", "calendar")}
          ${metric("予約確定", "0", "権限別に表示", "check")}
          ${metric("本人確認", "0", "運営者のみ", "shield")}
          ${metric("安全記録", "0", "分離管理", "alert")}
        </div>
        <section class="dash-panel wide locked-panel">
          <div>${icon("lock")}</div>
          <h2>運営者権限が必要です</h2>
          <p>予約満員、当日キャンセル、空き枠の再提供、托児交接、安全研修、保険状態は運営者アカウントで確認します。</p>
          <button type="button" data-demo-login="operator">運営者で体験ログイン</button>
        </section>
      </main>
    </section>
  `;
}

function metric(label, value, note, glyph) {
  return `<button class="metric" type="button" data-modal="metric:${label}"><div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>${icon(glyph)}</button>`;
}

function bindEvents() {
  const photoInput = document.querySelector("[data-photo-input]");
  if (photoInput) photoInput.addEventListener("change", handlePhotoChange);
  const placeSelect = document.querySelector("[data-place]");
  if (placeSelect) placeSelect.addEventListener("change", (event) => update({ selectedPlace: event.target.value, toast: "場所を更新しました" }));
  const backendForm = document.querySelector("[data-backend-form]");
  if (backendForm) {
    backendForm.addEventListener("input", saveBackendDraft);
    backendForm.addEventListener("change", saveBackendDraft);
  }
}

function handleClick(event) {
  const el = event.target.closest("button");
  if (!el) return;
  if (el.dataset.closeModal !== undefined) return update({ modal: null });
  if (el.dataset.authMode) return update({ authMode: el.dataset.authMode, modal: null });
  if (el.dataset.authRole) return update({ authRole: el.dataset.authRole });
  if (el.dataset.demoLogin) return demoLogin(el.dataset.demoLogin);
  if (el.dataset.loginSubmit !== undefined) return submitLogin();
  if (el.dataset.registerSubmit !== undefined) return submitRegister();
  if (el.dataset.logout !== undefined) return logout();
  if (el.dataset.dismissIntro !== undefined) return dismissIntro();
  if (el.dataset.resetBackend !== undefined) return resetBackendData();
  if (el.dataset.cloudConnect !== undefined) return connectCloudFromForm();
  if (el.dataset.cloudPush !== undefined) return manualCloudPush();
  if (el.dataset.cloudDisconnect !== undefined) return disconnectCloud();
  if (el.dataset.backendPublish !== undefined) return publishBackendRequest();
  if (el.dataset.backendResolve) return resolveBackendRequest(el.dataset.backendResolve);
  if (el.dataset.tab) {
    if (!state.isAuthenticated) return update({ authMode: "login", modal: "login-required", toast: "ログインが必要です" });
    if (el.dataset.tab === "publish") state.draftPhoto = null;
    return update({ tab: el.dataset.tab, modal: null });
  }
  if (el.dataset.toggleSchedule !== undefined) return update({ scheduleOpen: !state.scheduleOpen });
  if (el.dataset.toggleSlotSchedule !== undefined) return update({ scheduleSlotsOpen: !state.scheduleSlotsOpen });
  if (el.dataset.toggleServiceSection) return toggleServiceSection(el.dataset.toggleServiceSection);
  if (el.dataset.filter) return update({ serviceFilter: el.dataset.filter });
  if (el.dataset.publishGroup) return selectPublishGroup(el.dataset.publishGroup);
  if (el.dataset.date) return update({ selectedDate: el.dataset.date, toast: `${dateLabelFromIso(el.dataset.date)}を選択しました` });
  if (el.dataset.bookingType) return update({ bookingType: el.dataset.bookingType, toast: `${bookingTypes.find((type) => type.id === el.dataset.bookingType)?.label}に切り替えました` });
  if (el.dataset.startTime) return selectStartTime(el.dataset.startTime);
  if (el.dataset.endTime) return update({ selectedEnd: el.dataset.endTime, toast: `${state.selectedStart} - ${el.dataset.endTime}を選択しました` });
  if (el.dataset.slotDetail) return update({ modal: `slot:${el.dataset.slotDetail}` });
  if (el.dataset.slotConfirm) return confirmSlot(el.dataset.slotConfirm);
  if (el.dataset.slotReserve) return reserveSlot(el.dataset.slotReserve);
  if (el.dataset.slotCancel) return cancelSlot(el.dataset.slotCancel);
  if (el.dataset.bookingDetail) return update({ modal: `booking:${el.dataset.bookingDetail}` });
  if (el.dataset.serviceDetail) return update({ modal: `service:${el.dataset.serviceDetail}` });
  if (el.dataset.backendRequestDetail) return update({ modal: `backend:${el.dataset.backendRequestDetail}` });
  if (el.dataset.benefitDetail) return update({ modal: `benefit:${el.dataset.benefitDetail}` });
  if (el.dataset.exchangeBenefit) return exchangeBenefit(el.dataset.exchangeBenefit);
  if (el.dataset.requestService) return requestService(el.dataset.requestService);
  if (el.dataset.cancelRequestService) return cancelRequestService(el.dataset.cancelRequestService);
  if (el.dataset.acceptService) return acceptService(el.dataset.acceptService);
  if (el.dataset.cancelAcceptService) return cancelAcceptService(el.dataset.cancelAcceptService);
  if (el.dataset.acceptBackendRequest) return acceptBackendRequest(el.dataset.acceptBackendRequest);
  if (el.dataset.cancelBackendRequest) return cancelBackendRequest(el.dataset.cancelBackendRequest);
  if (el.dataset.customRequestDetail) return update({ modal: `custom:${el.dataset.customRequestDetail}` });
  if (el.dataset.cancelCustomRequest) return cancelCustomRequest(el.dataset.cancelCustomRequest);
  if (el.dataset.publishSubmit !== undefined) return publishCustomRequest();
  if (el.dataset.ledger) return update({ modal: `ledger:${el.dataset.ledger}` });
  if (el.dataset.openScheduleHome !== undefined) return update({ tab: "home", scheduleOpen: true, toast: "本日の予約に反映しました" });
  if (el.dataset.checkin !== undefined) return toggleCheckin();
  if (el.dataset.modal) return update({ modal: el.dataset.modal });
}

async function connectCloudFromForm() {
  const form = document.querySelector("[data-cloud-form]");
  const url = form?.querySelector('[name="url"]')?.value.trim();
  const anonKey = form?.querySelector('[name="anonKey"]')?.value.trim();
  if (!url || !anonKey) return update({ modal: "cloud-config-missing", toast: "Supabase URLとkeyを入力してください" });
  saveCloudConfig({ url, anonKey });
  const ok = await initCloudFromConfig({ silent: false });
  update({ modal: ok ? "cloud-connected" : "cloud-error", toast: ok ? "Supabaseに接続しました" : "Supabase接続に失敗しました" });
}

async function manualCloudPush() {
  if (!supabaseClient) {
    const ok = await initCloudFromConfig({ silent: false });
    if (!ok) return;
  }
  try {
    await pushCloudState();
    update({ modal: "cloud-pushed", toast: "現在のデータを云端へ上传しました" });
  } catch (error) {
    state.cloud = { enabled: false, status: "error", lastSync: state.cloud.lastSync || "", error: error.message || "Cloud push failed" };
    update({ modal: "cloud-error", toast: "云端上传に失敗しました" });
  }
}

function disconnectCloud() {
  if (supabaseClient && supabaseChannel) supabaseClient.removeChannel(supabaseChannel);
  supabaseClient = null;
  supabaseChannel = null;
  removeCloudConfig();
  state.cloud = { enabled: false, status: "local", lastSync: "", error: "" };
  update({ modal: "cloud-disconnected", toast: "云同步を切断しました" });
}

function demoLogin(role) {
  state.currentUser = { ...demoUsers[role], verification: { ...demoUsers[role].verification } };
  update({ isAuthenticated: true, tab: "home", authMode: "login", modal: shouldShowIntro() ? "intro" : null, toast: `${state.currentUser.roleLabel}でログインしました` });
}

async function submitLogin() {
  const form = document.querySelector("[data-login-form]");
  const email = rawFieldValue(form, "email");
  const password = rawFieldValue(form, "password");
  if (!email || !password) return update({ modal: "auth-error", toast: "メールとパスワードを入力してください" });
  if (supabaseClient?.auth) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (!error && data?.user) {
      await loadCloudProfile(data.user);
      await pullRealDataState();
      subscribeRealDataTables();
      return update({ isAuthenticated: true, tab: "home", modal: shouldShowIntro() ? "intro" : null, toast: "Supabaseでログインしました" });
    }
  }
  const role = Object.keys(demoUsers).find((key) => demoUsers[key].email === email) || "parent";
  demoLogin(role);
}

async function submitRegister() {
  const form = document.querySelector("[data-register-form]");
  const name = fieldValue(form, "name");
  const kana = fieldValue(form, "kana");
  const email = rawFieldValue(form, "email");
  const password = rawFieldValue(form, "password");
  const phone = fieldValue(form, "phone");
  const area = fieldValue(form, "area");
  const household = fieldValue(form, "household");
  const emergency = fieldValue(form, "emergency");
  const purpose = fieldValue(form, "purpose");
  const consent = form.querySelector("[name='consent']")?.checked;
  if (!name || !kana || !email || !password || !phone || !area || !household || !emergency || !purpose || !consent) {
    return update({ modal: "register-error", toast: "登録情報を確認してください" });
  }
  const role = roleOptions.find((item) => item.id === state.authRole);
  if (supabaseClient?.auth) {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) return update({ modal: "auth-error", toast: error.message });
    if (data?.user && data?.session) {
      const dbRole = state.authRole === "operator" ? "parent" : state.authRole;
      const verification = initialVerification(dbRole);
      const { error: profileError } = await supabaseClient.from("profiles").upsert({
        id: data.user.id,
        role: dbRole,
        display_name: name,
        kana,
        email,
        phone,
        area,
        household,
        emergency_contact: emergency,
        purpose,
        verification
      });
      if (profileError) return update({ modal: "auth-error", toast: profileError.message });
      await loadCloudProfile(data.user);
      await pullRealDataState();
      return update({ isAuthenticated: true, tab: "account", modal: shouldShowIntro() ? "intro" : "registered", toast: "Supabase登録が完了しました" });
    }
    return update({ modal: "signup-email-check", toast: "確認メールを確認してください" });
  }
  state.currentUser = {
    name,
    kana,
    email,
    phone,
    role: state.authRole,
    roleLabel: role.label,
    area,
    household,
    emergency,
    purpose,
    verification: initialVerification(state.authRole)
  };
  update({ isAuthenticated: true, tab: "account", modal: shouldShowIntro() ? "intro" : "registered", toast: "登録が完了しました" });
}

function initialVerification(role) {
  if (role === "operator") return { identity: "事務局確認待ち", training: "管理権限確認待ち", insurance: "確認担当", childSafety: "同意済み" };
  if (role === "collaborator") return { identity: "確認待ち", training: "未研修", insurance: "確認待ち", childSafety: "同意済み" };
  return { identity: "確認待ち", training: "対象外", insurance: "確認待ち", childSafety: "同意済み" };
}

function logout() {
  if (supabaseClient?.auth) supabaseClient.auth.signOut();
  state.cloud = { ...state.cloud, realData: false, userId: "" };
  state.currentUser = null;
  update({ isAuthenticated: false, tab: "home", authMode: "login", modal: null, toast: "ログアウトしました" });
}

function shouldShowIntro() {
  if (APP_MODE === "admin") return false;
  return !state.introDismissed && localStorage.getItem("kitaku-intro-dismissed") !== "1";
}

function dismissIntro() {
  state.introDismissed = true;
  localStorage.setItem("kitaku-intro-dismissed", "1");
  update({ modal: null, toast: "次回から説明を省略します" });
}

function toggleServiceSection(key) {
  state.serviceSections[key] = !state.serviceSections[key];
  update({});
}

function selectPublishGroup(group) {
  state.publishGroup = group;
  document.querySelectorAll("[data-publish-group]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.publishGroup === group);
  });
}

function selectStartTime(time) {
  const nextEnd = minutes(state.selectedEnd) > minutes(time) ? state.selectedEnd : nextTimeAfter(time);
  update({ selectedStart: time, selectedEnd: nextEnd, toast: `${time}開始を選択しました` });
}

async function writeBookingStatus(id, status) {
  if (!realDataReady()) return;
  const parsed = parseSlotKey(id);
  if (!parsed) return;
  const existing = await supabaseClient.from("bookings").select("id,user_id").eq("booking_key", id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const { error } = await supabaseClient.from("bookings").update({ status, updated_at: new Date().toISOString() }).eq("booking_key", id);
    if (error) throw error;
  } else {
    const { error } = await supabaseClient.from("bookings").insert({
      user_id: state.cloud.userId,
      booking_key: id,
      booking_type: parsed.type,
      place_id: parsed.placeId,
      resource_id: parsed.resourceId,
      date: parsed.date,
      start_time: parsed.start,
      end_time: parsed.end,
      status,
      child_info: state.currentUser?.household || ""
    });
    if (error) throw error;
  }
  if (state.currentUser?.role === "operator") await logOperatorAction(`booking_${status}`, "bookings", id, { booking_key: id });
}

async function confirmSlot(id) {
  state.reservedSlots.delete(id);
  state.confirmedSlots.add(id);
  try { await writeBookingStatus(id, "confirmed"); } catch (error) { state.cloud = { ...state.cloud, status: "error", error: error.message }; }
  const slot = bookingFromKey(id);
  update({ scheduleOpen: true, toast: `${slot?.time || "予約"}を確定しました` });
}

async function reserveSlot(id) {
  if (!state.confirmedSlots.has(id)) state.reservedSlots.add(id);
  try { await writeBookingStatus(id, "pending"); } catch (error) { state.cloud = { ...state.cloud, status: "error", error: error.message }; }
  const slot = bookingFromKey(id);
  update({ scheduleOpen: true, toast: `${slot?.time || "予約"}を予約しました` });
}

async function cancelSlot(id) {
  state.confirmedSlots.delete(id);
  state.reservedSlots.delete(id);
  try { await writeBookingStatus(id, "cancelled"); } catch (error) { state.cloud = { ...state.cloud, status: "error", error: error.message }; }
  const slot = bookingFromKey(id);
  update({ scheduleOpen: true, modal: null, toast: `${slot?.time || "予約"}を取り消しました` });
}

function requestService(id) {
  state.requestedServices.add(id);
  const service = services.find((s) => s.id === id);
  writeTemplateServiceRequest(id).catch((error) => state.cloud = { ...state.cloud, status: "error", error: error.message });
  update({ tab: "services", modal: `request:${id}`, toast: `${service.title}を公開しました` });
}

function cancelRequestService(id) {
  const service = services.find((s) => s.id === id);
  state.requestedServices.delete(id);
  updateCloudServiceStatus(id, "cancelled").catch((error) => state.cloud = { ...state.cloud, status: "error", error: error.message });
  update({ tab: "services", modal: null, toast: `${service.title}の公開を取り消しました` });
}

async function writeTemplateServiceRequest(id) {
  if (!realDataReady()) return;
  const service = services.find((item) => item.id === id);
  const profile = serviceProfiles[id];
  if (!service || !profile) return;
  const { error } = await supabaseClient.from("service_requests").insert({
    owner_id: state.cloud.userId,
    source: "template",
    title: service.title,
    category: service.group,
    person: profile.person,
    place: profile.place,
    content: profile.content,
    desired_time: profile.time,
    credit: Number(profile.credit),
    photo_name: profile.photo,
    status: "open"
  });
  if (error) throw error;
}

async function updateCloudServiceStatus(id, status) {
  if (!realDataReady()) return;
  const { error } = await supabaseClient.from("service_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

async function completeActiveCloudWork(slotKeys, backendIds, serviceTitles) {
  if (!realDataReady()) return;
  const updates = [];
  if (slotKeys.length) {
    updates.push(supabaseClient.from("bookings").update({ status: "completed", updated_at: new Date().toISOString() }).in("booking_key", slotKeys));
  }
  if (backendIds.length) {
    updates.push(supabaseClient.from("service_requests").update({ status: "completed", updated_at: new Date().toISOString() }).in("id", backendIds));
  }
  if (serviceTitles.length) {
    updates.push(supabaseClient.from("service_requests").update({ status: "completed", updated_at: new Date().toISOString() }).eq("source", "template").eq("accepted_by", state.cloud.userId).eq("status", "accepted").in("title", serviceTitles));
  }
  const results = await Promise.all(updates);
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;
}

async function publishCustomRequest() {
  const form = document.querySelector("[data-publish-form]");
  const person = fieldValue(form, "person");
  const place = fieldValue(form, "place");
  const title = fieldValue(form, "title");
  const content = fieldValue(form, "content");
  const credit = fieldValue(form, "credit");
  const time = fieldValue(form, "time") || "日時調整中";
  const photoInput = form.querySelector("[name='photo']");
  const photoName = state.draftPhoto?.name || (photoInput?.files?.[0] ? escapeHtml(photoInput.files[0].name) : "写真未添付");
  if (!person || !place || !title || !content || !credit) {
    return update({ modal: "publish-error", toast: "必須項目を入力してください" });
  }
  let id = `custom-${Date.now()}`;
  const customRequest = { id, person, place, title, content, credit, time, photoName, group: state.publishGroup, photoDataUrl: state.draftPhoto?.dataUrl || "" };
  if (realDataReady()) {
    const { data, error } = await supabaseClient.from("service_requests").insert({
      owner_id: state.cloud.userId,
      source: "user",
      title,
      category: state.publishGroup,
      person,
      place,
      content,
      desired_time: time,
      credit: Number(credit),
      photo_name: photoName,
      photo_data_url: customRequest.photoDataUrl,
      status: "open"
    }).select("id").single();
    if (error) return update({ modal: "cloud-error", toast: error.message });
    id = data.id;
    customRequest.id = id;
  }
  state.customRequests.unshift(customRequest);
  state.draftPhoto = null;
  update({ tab: "services", modal: `custom-published:${id}`, toast: `${title}を公開しました` });
}

function handlePhotoChange(event) {
  const file = event.target.files?.[0];
  const preview = document.querySelector("[data-photo-preview]");
  if (!file) {
    state.draftPhoto = null;
    if (preview) preview.textContent = "写真はまだ選択されていません";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    state.draftPhoto = { name: escapeHtml(file.name), dataUrl: reader.result };
    if (preview) preview.innerHTML = photoPreviewMarkup(state.draftPhoto);
  };
  reader.readAsDataURL(file);
}

function photoPreviewMarkup(photo) {
  return `<figure class="photo-preview-card"><img src="${photo.dataUrl}" alt="添付写真のプレビュー" /><figcaption>${photo.name}</figcaption></figure>`;
}

function cancelCustomRequest(id) {
  const request = state.customRequests.find((item) => item.id === id);
  state.customRequests = state.customRequests.filter((item) => item.id !== id);
  updateCloudServiceStatus(id, "cancelled").catch((error) => state.cloud = { ...state.cloud, status: "error", error: error.message });
  update({ tab: "services", modal: null, toast: `${request?.title || "依頼"}を取り消しました` });
}

async function acceptService(id) {
  if (!["collaborator", "operator"].includes(state.currentUser?.role)) {
    return update({ modal: "accept-role-blocked", toast: "協力者登録が必要です" });
  }
  if (state.currentUser.role === "collaborator" && state.currentUser.verification.training !== "研修済み") {
    return update({ modal: "training-blocked", toast: "安全研修後に接単できます" });
  }
  const service = services.find((s) => s.id === id);
  state.acceptedServices.add(id);
  if (realDataReady()) {
    const profile = serviceProfiles[id];
    await supabaseClient.from("service_requests").insert({
      owner_id: state.cloud.userId,
      accepted_by: state.cloud.userId,
      source: "template",
      title: service.title,
      category: service.group,
      person: profile.person,
      place: profile.place,
      content: profile.content,
      desired_time: profile.time,
      credit: Number(profile.credit),
      photo_name: profile.photo,
      status: "accepted"
    });
  }
  update({ tab: "home", scheduleOpen: true, modal: `accept:${id}`, toast: `${service.title}を受けました` });
}

function exchangeBenefit(id) {
  const benefit = partnerBenefits.find((item) => item.id === id);
  if (!benefit) return;
  if (state.exchangedBenefits.has(id)) return update({ modal: `benefit:${id}` });
  if (state.balance < benefit.cost) {
    return update({ modal: `benefit-short:${id}`, toast: "時間通貨が足りません" });
  }
  state.balance = Number((state.balance - benefit.cost).toFixed(2));
  state.exchangedBenefits.add(id);
  state.activityRecords.unshift({
    date: formatShortDate(jstNow()),
    title: benefit.title,
    meta: `${benefit.partner}・地域クーポン交換`,
    amount: `-${benefit.cost}時間`,
    type: "minus"
  });
  writeLedgerRecord({
    title: benefit.title,
    amount: -Number(benefit.cost),
    entryType: "spend",
    sourceType: "partner_benefit",
    sourceId: id,
    meta: `${benefit.partner}・地域クーポン交換`
  }).catch((error) => state.cloud = { ...state.cloud, status: "error", error: error.message });
  update({ tab: "services", modal: `benefit-done:${id}`, toast: `${benefit.title}を交換しました` });
}

function acceptBackendRequest(id) {
  if (!["collaborator", "operator"].includes(state.currentUser?.role)) {
    return update({ modal: "accept-role-blocked", toast: "協力者登録が必要です" });
  }
  const request = findBackendRequest(id);
  if (!request || request.status === "closed") return update({ modal: "backend-missing", toast: "募集は終了しています" });
  state.acceptedBackendRequests.add(id);
  if (realDataReady()) {
    supabaseClient.from("service_requests").update({ accepted_by: state.cloud.userId, status: "accepted", updated_at: new Date().toISOString() }).eq("id", id)
      .then(({ error }) => { if (error) throw error; })
      .catch((error) => state.cloud = { ...state.cloud, status: "error", error: error.message });
  }
  update({ tab: "home", scheduleOpen: true, modal: `backend-accepted:${id}`, toast: `${request.title}を受けました` });
}

function cancelBackendRequest(id) {
  const request = findBackendRequest(id);
  state.acceptedBackendRequests.delete(id);
  if (realDataReady()) {
    supabaseClient.from("service_requests").update({ accepted_by: null, status: "open", updated_at: new Date().toISOString() }).eq("id", id)
      .then(({ error }) => { if (error) throw error; })
      .catch((error) => state.cloud = { ...state.cloud, status: "error", error: error.message });
  }
  update({ tab: "services", modal: null, toast: `${request?.title || "后台依頼"}の接単を取り消しました` });
}

function cancelAcceptService(id) {
  const service = services.find((s) => s.id === id);
  state.acceptedServices.delete(id);
  update({ tab: "services", modal: null, toast: `${service.title}の接単を取り消しました` });
}

async function publishBackendRequest() {
  const form = document.querySelector("[data-backend-form]");
  if (form) syncBackendDraft(form);
  const title = backendField(form, "title");
  const person = backendField(form, "person") || "事務局";
  const place = backendField(form, "place") || "藤原台コワーキングスペース";
  const group = backendField(form, "group") || "こども";
  const time = backendField(form, "time") || "日時調整中";
  const credit = backendField(form, "credit") || "1.0";
  const content = backendField(form, "content");
  if (!title || !content) return update({ modal: "backend-publish-error", toast: "后台依頼の内容を入力してください" });
  const request = {
    id: `backend-${Date.now()}`,
    title,
    person,
    place,
    group,
    time,
    credit,
    content,
    status: "open",
    createdAt: formatDate(jstNow())
  };
  if (realDataReady()) {
    const { data, error } = await supabaseClient.from("service_requests").insert({
      owner_id: state.cloud.userId,
      source: "operator",
      title,
      category: group,
      person,
      place,
      content,
      desired_time: time,
      credit: Number(credit),
      status: "open"
    }).select("id").single();
    if (error) return update({ modal: "cloud-error", toast: error.message });
    request.id = data.id;
    await logOperatorAction("publish_service_request", "service_requests", data.id, { title, credit });
  }
  state.backendRequests.unshift(request);
  state.backendDraft = {};
  update({ modal: "backend-published", toast: `${title}を前端に公開しました` });
}

function resolveBackendRequest(id) {
  const request = findBackendRequest(id);
  if (request) request.status = "closed";
  state.acceptedBackendRequests.delete(id);
  if (realDataReady()) {
    supabaseClient.from("service_requests").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", id)
      .then(({ error }) => { if (error) throw error; return logOperatorAction("close_service_request", "service_requests", id, { title: request?.title }); })
      .catch((error) => state.cloud = { ...state.cloud, status: "error", error: error.message });
  }
  update({ modal: null, toast: `${request?.title || "依頼"}を終了しました` });
}

function resetBackendData() {
  localStorage.removeItem(STORAGE_KEY);
  state.balance = 0;
  state.checkedIn = false;
  state.modal = null;
  state.toast = "データを初期化しました";
  state.requestedServices = new Set();
  state.acceptedServices = new Set();
  state.acceptedBackendRequests = new Set();
  state.exchangedBenefits = new Set();
  state.customRequests = [];
  state.backendRequests = [];
  state.backendDraft = {};
  state.confirmedSlots = new Set();
  state.reservedSlots = new Set();
  state.activityRecords = [];
  saveState();
  scheduleCloudSave();
  render();
}

function fieldValue(form, name) {
  return escapeHtml(form.querySelector(`[name="${name}"]`)?.value.trim() || "");
}

function rawFieldValue(form, name) {
  return form.querySelector(`[name="${name}"]`)?.value.trim() || "";
}

function backendField(form, name) {
  const liveValue = form?.querySelector(`[name="${name}"]`)?.value;
  const value = liveValue ?? state.backendDraft?.[name] ?? "";
  return escapeHtml(String(value).trim());
}

function saveBackendDraft(event) {
  const form = event.currentTarget;
  syncBackendDraft(form);
  saveState();
}

function syncBackendDraft(form) {
  state.backendDraft = {};
  form.querySelectorAll("input, select, textarea").forEach((field) => {
    if (field.name) state.backendDraft[field.name] = field.value;
  });
}

function selectedOption(current, value) {
  return (current || "こども") === value ? "selected" : "";
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function toggleCheckin() {
  const hasConfirmedWork = state.confirmedSlots.size > 0 || state.acceptedServices.size > 0 || state.acceptedBackendRequests.size > 0;
  if (!state.checkedIn && !hasConfirmedWork) {
    return update({ modal: "checkin-blocked", toast: "予約確定または接単が必要です" });
  }
  if (state.checkedIn) {
    const creditAmount = pendingCreditAmount();
    const completedServices = [...state.acceptedServices]
      .map((id) => services.find((service) => service.id === id)?.title)
      .filter(Boolean);
    const completedBackend = [...state.acceptedBackendRequests]
      .map((id) => findBackendRequest(id)?.title)
      .filter(Boolean);
    const completedBackendIds = [...state.acceptedBackendRequests];
    const completedSlotKeys = [...state.confirmedSlots];
    const completedSlots = [...state.confirmedSlots]
      .map(bookingFromKey)
      .filter(Boolean)
      .map((slot) => slot.label);
    state.balance = Number((state.balance + creditAmount).toFixed(1));
    state.activityRecords.unshift({
      date: formatShortDate(jstNow()),
      title: completedServices[0] || completedBackend[0] || completedSlots[0] || "活動完了",
      meta: completedBackend.length ? "后台公開依頼・前台確認済み" : completedServices.length ? "サービス接単・前台確認済み" : "予約利用・前台確認済み",
      amount: `+${creditAmount.toFixed(1)}時間`,
      type: "plus"
    });
    writeLedgerRecord({
      title: completedServices[0] || completedBackend[0] || completedSlots[0] || "活動完了",
      amount: creditAmount,
      entryType: "earn",
      sourceType: completedBackend.length ? "service_request" : completedServices.length ? "service_acceptance" : "booking",
      sourceId: completedBackend[0] || completedServices[0] || completedSlots[0] || "",
      meta: completedBackend.length ? "后台公開依頼・前台確認済み" : completedServices.length ? "サービス接単・前台確認済み" : "予約利用・前台確認済み"
    }).catch((error) => state.cloud = { ...state.cloud, status: "error", error: error.message });
    writeSafetyRecord({ category: "checkout", detail: "前台で活動終了を確認。時間台帳と安全記録を分離保存。", status: "closed" })
      .catch((error) => state.cloud = { ...state.cloud, status: "error", error: error.message });
    completeActiveCloudWork(completedSlotKeys, completedBackendIds, completedServices)
      .catch((error) => state.cloud = { ...state.cloud, status: "error", error: error.message });
    state.confirmedSlots.clear();
    state.acceptedServices.clear();
    state.acceptedBackendRequests.clear();
    update({ checkedIn: false, scheduleOpen: false, modal: "checked-out", toast: `${creditAmount.toFixed(1)}時間を記録しました` });
  } else {
    writeSafetyRecord({ category: "checkin", detail: "前台で活動開始を確認。", status: "closed" })
      .catch((error) => state.cloud = { ...state.cloud, status: "error", error: error.message });
    update({ checkedIn: true, modal: "checked-in", toast: "チェックインしました" });
  }
}

function pendingCreditAmount() {
  const serviceCredits = [...state.acceptedServices].reduce((sum, id) => {
    const service = services.find((item) => item.id === id);
    return sum + creditFromText(service?.time || "");
  }, 0);
  const backendCredits = [...state.acceptedBackendRequests].reduce((sum, id) => {
    const request = findBackendRequest(id);
    return sum + Number(request?.credit || 0);
  }, 0);
  const bookingCredits = [...state.confirmedSlots].reduce((sum, id) => {
    const slot = bookingFromKey(id);
    if (!slot) return sum;
    const [start, end] = slot.time.split(" - ");
    return sum + Math.max((minutes(end) - minutes(start)) / 60, 0);
  }, 0);
  return Number((serviceCredits + backendCredits + bookingCredits).toFixed(2));
}

function creditFromText(text) {
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)時間/);
  return match ? Number(match[1]) : 0;
}

async function writeLedgerRecord({ title, amount, entryType, sourceType, sourceId = "", meta = "" }) {
  if (!realDataReady()) return;
  const { error } = await supabaseClient.from("time_ledger").insert({
    user_id: state.cloud.userId,
    source_type: sourceType,
    source_id: sourceId,
    title,
    amount,
    entry_type: entryType,
    meta
  });
  if (error) throw error;
}

async function writeSafetyRecord({ category, detail, status = "open", bookingId = null }) {
  if (!realDataReady()) return;
  const { error } = await supabaseClient.from("safety_records").insert({
    user_id: state.cloud.userId,
    booking_id: bookingId,
    category,
    detail,
    status,
    handled_by: state.currentUser?.role === "operator" ? state.cloud.userId : null
  });
  if (error) throw error;
}

async function logOperatorAction(action, targetTable, targetId, details = {}) {
  if (!realDataReady() || state.currentUser?.role !== "operator") return;
  const { error } = await supabaseClient.from("operator_actions").insert({
    operator_id: state.cloud.userId,
    action,
    target_table: targetTable,
    target_id: String(targetId || ""),
    details
  });
  if (error) throw error;
}

function update(next) {
  Object.assign(state, next);
  saveState();
  scheduleCloudSave();
  render();
  if (next.toast) setTimeout(() => {
    state.toast = "";
    render();
  }, 1300);
}

function operatorBookingDetailBody(key) {
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  if (kind === "slot") {
    const slot = bookingFromKey(id);
    if (!slot) return { title: "予約申請", body: "<p>この予約申請は見つかりません。</p>" };
    const applicant = demoUsers.parent;
    const parsed = parseSlotKey(id);
    const isConfirmed = state.confirmedSlots.has(id);
    const isReserved = state.reservedSlots.has(id);
    const status = isConfirmed ? "確定済み" : isReserved ? "予約申請中" : "未処理";
    const credit = Math.max((minutes(parsed.end) - minutes(parsed.start)) / 60, 0).toFixed(1);
    return {
      title: "预约申请详细",
      body: `
        <dl>
          <dt>申请人</dt><dd>${applicant.name}（${applicant.roleLabel}）</dd>
          <dt>电话</dt><dd>${applicant.phone}</dd>
          <dt>邮箱</dt><dd>${applicant.email}</dd>
          <dt>生活圈</dt><dd>${applicant.area}</dd>
          <dt>儿童信息</dt><dd>${applicant.household}</dd>
          <dt>紧急联系</dt><dd>${applicant.emergency}</dd>
          <dt>申请内容</dt><dd>${bookingTypes.find((item) => item.id === slot.type)?.label || "予約"} / ${slot.label}</dd>
          <dt>日期</dt><dd>${slot.dateLabel}</dd>
          <dt>时间</dt><dd>${slot.time}</dd>
          <dt>地点</dt><dd>${slot.place}</dd>
          <dt>状态</dt><dd>${status}</dd>
          <dt>预计时间</dt><dd>${credit}時間</dd>
          <dt>安全边界</dt><dd>${slot.type === "childcare" ? "一時保育枠は契約スタッフ確認、引渡し・排泄・午睡は時間銀行対象外" : "作業席利用。子どもの専門保育は含まない"}</dd>
        </dl>
        <div class="modal-actions">${isConfirmed ? `<button class="secondary-button" type="button" data-slot-cancel="${id}">予約を取消</button>` : `<button class="primary-button" type="button" data-slot-confirm="${id}">承認して確定</button><button class="secondary-button" type="button" data-slot-cancel="${id}">却下/取消</button>`}</div>
      `
    };
  }
  if (kind === "service") {
    const service = services.find((item) => item.id === id);
    const profile = serviceProfiles[id];
    return {
      title: "服务接单详细",
      body: service ? `<dl><dt>服务名</dt><dd>${service.title}</dd><dt>申请人</dt><dd>${profile.person}</dd><dt>地点</dt><dd>${profile.place}</dd><dt>时间</dt><dd>${profile.time}</dd><dt>内容</dt><dd>${profile.content}</dd><dt>时间通货</dt><dd>${profile.credit}時間</dd><dt>条件</dt><dd>${service.rule}</dd><dt>后台状态</dt><dd>接単中</dd></dl><div class="modal-actions"><button class="secondary-button" type="button" data-cancel-accept-service="${id}">接単を取消</button></div>` : "<p>服务信息不存在。</p>"
    };
  }
  if (kind === "backend") {
    const request = findBackendRequest(id);
    return {
      title: "后台需求接单详细",
      body: request ? backendRequestOperatorBody(request, state.acceptedBackendRequests.has(id)) : "<p>后台需求不存在。</p>"
    };
  }
  return { title: "预约详细", body: "<p>记录不存在。</p>" };
}

function operatorServiceDetailBody(key) {
  const [source, id] = key.split(":");
  if (source === "service") {
    const service = services.find((item) => item.id === id);
    const profile = serviceProfiles[id];
    return {
      title: "公开服务详细",
      body: service ? `<dl><dt>服务名</dt><dd>${service.title}</dd><dt>发布人</dt><dd>${profile.person}</dd><dt>地点</dt><dd>${profile.place}</dd><dt>希望时间</dt><dd>${profile.time}</dd><dt>服务内容</dt><dd>${profile.content}</dd><dt>时间通货</dt><dd>${profile.credit}時間</dd><dt>研修条件</dt><dd>${service.rule}</dd><dt>后台状态</dt><dd>${state.acceptedServices.has(id) ? "接単中" : state.requestedServices.has(id) ? "公開中" : "テンプレート"}</dd></dl><div class="modal-actions">${state.acceptedServices.has(id) ? `<button class="secondary-button" type="button" data-cancel-accept-service="${id}">接単を取消</button>` : `<button class="secondary-button" type="button" data-service-detail="${id}:accept">前端で確認</button>`}</div>` : "<p>服务信息不存在。</p>"
    };
  }
  if (source === "custom") {
    const request = state.customRequests.find((item) => item.id === id);
    return {
      title: "用户发布需求详细",
      body: request ? `<div class="service-photo">${request.photoDataUrl ? `<img src="${request.photoDataUrl}" alt="${request.title}の写真" />` : icon("file")}<span>${request.photoName || "写真未添付"}</span></div><dl><dt>发布人</dt><dd>${request.person || "人名未入力"}</dd><dt>地点</dt><dd>${request.place || "地点未入力"}</dd><dt>类型</dt><dd>${request.group || "こども"}</dd><dt>服务名</dt><dd>${request.title || "サービス名未入力"}</dd><dt>内容</dt><dd>${request.content || "サービス内容未入力"}</dd><dt>希望时间</dt><dd>${request.time || "日時調整中"}</dd><dt>时间通货</dt><dd>${request.credit || "0"}時間</dd><dt>后台状态</dt><dd>公開中</dd></dl><div class="modal-actions"><button class="secondary-button" type="button" data-cancel-custom-request="${id}">公開を取消</button></div>` : "<p>该公开需求不存在。</p>"
    };
  }
  if (source === "backend") {
    const request = findBackendRequest(id);
    return {
      title: "后台发布需求详细",
      body: request ? backendRequestOperatorBody(request, state.acceptedBackendRequests.has(id)) : "<p>后台需求不存在。</p>"
    };
  }
  return { title: "服务详细", body: "<p>记录不存在。</p>" };
}

function backendRequestOperatorBody(request, accepted) {
  return `<dl><dt>需求名</dt><dd>${request.title}</dd><dt>负责人</dt><dd>${request.person}</dd><dt>地点</dt><dd>${request.place}</dd><dt>类型</dt><dd>${request.group}</dd><dt>希望时间</dt><dd>${request.time}</dd><dt>内容</dt><dd>${request.content}</dd><dt>给付时间</dt><dd>${request.credit}時間</dd><dt>状态</dt><dd>${request.status === "closed" ? "終了" : accepted ? "接単中" : "公開中"}</dd><dt>安全备注</dt><dd>保育、引渡し、排泄、午睡、事故対応は契約スタッフ側で处理。时间银行只记录辅助活动。</dd></dl><div class="modal-actions">${request.status === "closed" ? "" : `<button class="secondary-button" type="button" data-backend-resolve="${request.id}">后台で終了</button>`}${accepted ? `<button class="secondary-button" type="button" data-cancel-backend-request="${request.id}">接単を取消</button>` : ""}</div>`;
}

function operatorLedgerDetailBody(index) {
  const record = state.activityRecords[Number(index)];
  return {
    title: "台账记录详细",
    body: record ? `<dl><dt>日期</dt><dd>${record.date}</dd><dt>项目</dt><dd>${record.title}</dd><dt>分类</dt><dd>${record.meta}</dd><dt>变动</dt><dd>${record.amount}</dd><dt>记录类型</dt><dd>${record.type === "plus" ? "时间通货发生" : "时间通货使用"}</dd><dt>安全分离</dt><dd>此处只保存一般时间通货台账，事故・苦情・引渡し记录不混入。</dd></dl>` : "<p>台账记录不存在。</p>"
  };
}

function modalView() {
  const [type, ...modalParts] = state.modal.split(":");
  const id = modalParts.join(":");
  let title = "詳細";
  let body = "<p>このボタンは詳細画面に接続されています。</p>";
  if (type === "operator-booking") {
    ({ title, body } = operatorBookingDetailBody(id));
  } else if (type === "operator-service") {
    ({ title, body } = operatorServiceDetailBody(id));
  } else if (type === "operator-ledger") {
    ({ title, body } = operatorLedgerDetailBody(id));
  } else if (type === "operator-user") {
    const user = demoUsers[id];
    title = user ? "利用者确认详细" : "利用者確認";
    body = user ? `<dl><dt>氏名</dt><dd>${user.name}</dd><dt>かな</dt><dd>${user.kana}</dd><dt>角色</dt><dd>${user.roleLabel}</dd><dt>邮箱</dt><dd>${user.email}</dd><dt>电话</dt><dd>${user.phone}</dd><dt>生活圈</dt><dd>${user.area}</dd><dt>家庭/经验</dt><dd>${user.household}</dd><dt>紧急联系</dt><dd>${user.emergency}</dd><dt>利用目的</dt><dd>${user.purpose}</dd><dt>本人确认</dt><dd>${user.verification.identity}</dd><dt>研修</dt><dd>${user.verification.training}</dd><dt>保险</dt><dd>${user.verification.insurance}</dd><dt>儿童安全同意</dt><dd>${user.verification.childSafety}</dd></dl><div class="modal-actions"><button class="secondary-button" type="button" data-modal="verification">確認ステータス</button></div>` : "<p>利用者信息不存在。</p>";
  } else if (state.modal === "operator-users") {
    title = "利用者一覧";
    body = operatorUserItems().map((item) => `<button class="timeline-item timeline-button" type="button" data-modal="${item.modal}"><span>${item.status}</span><div><strong>${item.title}</strong><small>${item.small}</small></div></button>`).join("");
  } else if (state.modal === "operator-safety") {
    title = "安全・事故記録";
    body = "<p>現在、事故・苦情はありません。正式版では引渡し、排泄、授乳、午睡、事故対応、苦情処理、アカウント停止判断をここに保存し、時間通貨台帳とは分離します。</p><dl><dt>事故</dt><dd>0件</dd><dt>苦情</dt><dd>0件</dd><dt>停止中</dt><dd>0件</dd><dt>処理待ち</dt><dd>0件</dd></dl>";
  } else if (state.modal === "backend-data-map") {
    title = "后台数据结构";
    body = "<p>正式后台需要把用户、预约、公开需求、接单、前台签到、时间台账、安全记录、合作店铺分开保存。这样运营者能查申请内容，也能避免专业保育和普通互助混在一起。</p>";
  } else if (type === "backend-data") {
    title = `${id} 数据`;
    body = "<p>这一类数据需要在正式云数据库中有独立表和权限控制。当前原型已经在后台页面展示入口，下一阶段可接 Supabase/Firebase 做多人同步。</p>";
  } else if (type === "slot") {
    const slot = bookingFromKey(id);
    const isConfirmed = state.confirmedSlots.has(id);
    const isReserved = state.reservedSlots.has(id);
    title = `${slot?.time || "予約"} の詳細`;
    body = slot
      ? `<dl><dt>日付</dt><dd>${slot.dateLabel}</dd><dt>時間</dt><dd>${slot.time}</dd><dt>種類</dt><dd>${bookingTypes.find((item) => item.id === slot.type)?.label || "予約"}</dd><dt>席位</dt><dd>${slot.label}</dd><dt>場所</dt><dd>${slot.place}</dd><dt>状態</dt><dd>${isConfirmed ? "確定済み" : isReserved ? "予約申請済み" : slot.seats}</dd></dl><div class="modal-actions">${isConfirmed ? `<button class="secondary-button" type="button" data-slot-cancel="${id}">予約を取消</button>` : isReserved ? `<button class="primary-button" type="button" data-slot-confirm="${id}">確定</button><button class="secondary-button" type="button" data-slot-cancel="${id}">取消</button>` : `<button class="primary-button" type="button" data-slot-confirm="${id}">確定</button><button class="secondary-button" type="button" data-slot-reserve="${id}">予約</button>`}</div>`
      : "<p>この予約情報は見つかりません。</p>";
  } else if (type === "booking") {
    const slot = bookingFromKey(id);
    title = `${slot?.time || "予約"} の予約詳細`;
    body = slot
      ? `<dl><dt>日付</dt><dd>${slot.dateLabel}</dd><dt>時間</dt><dd>${slot.time}</dd><dt>席位</dt><dd>${slot.label}</dd><dt>場所</dt><dd>${slot.place}</dd></dl><button class="secondary-button" type="button" data-slot-cancel="${id}">この予約を取消</button>`
      : "<p>予約は取り消されています。</p>";
  } else if (type === "service") {
    const [serviceId, mode = "publish"] = id.split(":");
    const service = services.find((s) => s.id === serviceId);
    const profile = serviceProfiles[serviceId];
    const requested = state.requestedServices.has(serviceId);
    const accepted = state.acceptedServices.has(serviceId);
    title = service.title;
    body = `<div class="service-photo">${icon(service.icon)}<span>${profile.photo}</span></div><p>${service.detail}</p><dl><dt>人名</dt><dd>${profile.person}</dd><dt>地点</dt><dd>${profile.place}</dd><dt>日時</dt><dd>${profile.time}</dd><dt>内容</dt><dd>${profile.content}</dd><dt>時間通貨</dt><dd>${profile.credit}時間</dd><dt>安全条件</dt><dd>${service.rule}</dd></dl><div class="modal-actions">${requested ? `<button class="secondary-button" type="button" data-cancel-request-service="${serviceId}">公開を取消</button>` : `<button class="primary-button" type="button" data-request-service="${serviceId}">依頼を公開</button>`}${accepted ? `<button class="secondary-button" type="button" data-cancel-accept-service="${serviceId}">接単を取消</button>` : `<button class="secondary-button" type="button" data-accept-service="${serviceId}">${mode === "accept" ? "この依頼を受ける" : "依頼を受ける"}</button>`}</div>`;
  } else if (type === "request") {
    const service = services.find((s) => s.id === id);
    title = "依頼を公開しました";
    body = `<p>${service.title}の依頼を事務局へ送信しました。</p><p>これはサービス交換として后台に表示されます。オフィス・保育予約には混ざりません。</p><button class="secondary-button" type="button" data-cancel-request-service="${id}">公開を取消</button>`;
  } else if (type === "backend") {
    const request = findBackendRequest(id);
    const accepted = state.acceptedBackendRequests.has(id);
    title = request?.title || "后台公開依頼";
    body = request
      ? `<p>${request.content}</p><dl><dt>担当</dt><dd>${request.person}</dd><dt>地点</dt><dd>${request.place}</dd><dt>タイプ</dt><dd>${request.group}</dd><dt>日時</dt><dd>${request.time}</dd><dt>時間通貨</dt><dd>${request.credit}時間</dd><dt>状態</dt><dd>${request.status === "closed" ? "終了" : accepted ? "接単中" : "募集中"}</dd></dl><div class="modal-actions">${request.status === "closed" ? "" : accepted ? `<button class="secondary-button" type="button" data-cancel-backend-request="${id}">接単を取消</button>` : `<button class="primary-button" type="button" data-accept-backend-request="${id}">この依頼を受ける</button>`}${state.currentUser?.role === "operator" && request.status !== "closed" ? `<button class="secondary-button" type="button" data-backend-resolve="${id}">后台で終了</button>` : ""}</div>`
      : "<p>この后台依頼は見つかりません。</p>";
  } else if (type === "backend-accepted") {
    const request = findBackendRequest(id);
    title = "后台依頼を受けました";
    body = request ? `<p>${request.title}を接単しました。ホームの本日の予約と后台の接単中リストに同期されています。</p><button class="secondary-button" type="button" data-cancel-backend-request="${id}">接単を取消</button>` : "<p>接単しました。</p>";
  } else if (type === "custom") {
    const request = state.customRequests.find((item) => item.id === id);
    title = request?.title || "公開依頼";
    body = request
      ? `<div class="service-photo">${request.photoDataUrl ? `<img src="${request.photoDataUrl}" alt="${request.title}の写真" />` : icon("file")}<span>${request.photoName || "写真未添付"}</span></div><dl><dt>人名</dt><dd>${request.person || "人名未入力"}</dd><dt>地点</dt><dd>${request.place || "地点未入力"}</dd><dt>タイプ</dt><dd>${request.group || "こども"}</dd><dt>内容</dt><dd>${request.content || "サービス内容未入力"}</dd><dt>時間通貨</dt><dd>${request.credit || "0"}時間</dd><dt>希望日時</dt><dd>${request.time || "日時調整中"}</dd><dt>写真</dt><dd>${request.photoName || "写真未添付"}</dd></dl><button class="secondary-button" type="button" data-cancel-custom-request="${id}">公開を取消</button>`
      : "<p>この依頼は取り消されています。</p>";
  } else if (type === "custom-published") {
    const request = state.customRequests.find((item) => item.id === id);
    title = "具体的な依頼を公開しました";
    body = request
      ? `<p>${request.title}を公開しました。后台の公開依頼にも反映されています。</p><div class="service-photo">${request.photoDataUrl ? `<img src="${request.photoDataUrl}" alt="${request.title}の写真" />` : icon("file")}<span>${request.photoName}</span></div><dl><dt>人名</dt><dd>${request.person}</dd><dt>地点</dt><dd>${request.place}</dd><dt>タイプ</dt><dd>${request.group}</dd><dt>時間通貨</dt><dd>${request.credit}時間</dd><dt>写真</dt><dd>${request.photoName}</dd></dl><button class="secondary-button" type="button" data-cancel-custom-request="${id}">公開を取消</button>`
      : "<p>公開依頼を処理しました。</p>";
  } else if (type === "accept") {
    const service = services.find((s) => s.id === id);
    title = "依頼を受けました";
    body = `<p>${service.title}を接単しました。本人確認・研修・保険条件を満たす場合だけ活動できます。</p><button class="secondary-button" type="button" data-cancel-accept-service="${id}">接単を取消</button>`;
  } else if (type === "benefit") {
    const benefit = partnerBenefits.find((item) => item.id === id);
    const exchanged = state.exchangedBenefits.has(id);
    title = benefit?.title || "地域クーポン";
    body = benefit
      ? `<div class="benefit-visual modal-benefit ${benefit.accent}"><span>${benefit.visual}</span></div><p>${benefit.detail}</p><dl><dt>店舗</dt><dd>${benefit.partner}</dd><dt>地域</dt><dd>${benefit.area}</dd><dt>カテゴリ</dt><dd>${benefit.category}</dd><dt>必要時間通貨</dt><dd>${benefit.cost}時間</dd><dt>状態</dt><dd>${exchanged ? "交換済み" : "未交換"}</dd></dl><div class="modal-actions">${exchanged ? `<button class="secondary-button" type="button" data-tab="ledger">台帳で確認</button>` : `<button class="primary-button" type="button" data-exchange-benefit="${benefit.id}">時間通貨で交換</button>`}</div>`
      : "<p>この特典は見つかりません。</p>";
  } else if (type === "benefit-short") {
    const benefit = partnerBenefits.find((item) => item.id === id);
    title = "時間通貨が足りません";
    body = benefit ? `<p>${benefit.title}の交換には ${benefit.cost} 時間が必要です。現在の残高は ${state.balance.toFixed(1)} 時間です。</p><button class="secondary-button" type="button" data-tab="checkin">活動を完了して残高を増やす</button>` : "<p>残高が足りません。</p>";
  } else if (type === "benefit-done") {
    const benefit = partnerBenefits.find((item) => item.id === id);
    title = "クーポンを交換しました";
    body = benefit ? `<p>${benefit.title}を交換しました。店頭でこの画面または台帳を提示してください。</p><dl><dt>店舗</dt><dd>${benefit.partner}</dd><dt>使用時間通貨</dt><dd>${benefit.cost}時間</dd><dt>残高</dt><dd>${state.balance.toFixed(1)}時間</dd></dl><button class="secondary-button" type="button" data-tab="ledger">台帳で確認</button>` : "<p>交換しました。</p>";
  } else if (type === "status") {
    title = `${id}の確認`;
    body = "<p>この状態は将来の后台データベースで本人確認書類、研修受講、保険加入、同意履歴と紐づけます。現在は画面プロトタイプ上の状態です。</p>";
  } else if (type === "safety") {
    title = `${id}は専門スタッフのみ`;
    body = `<p>${id}は時間銀行の交換対象外です。有資格者または契約スタッフが担当し、安全記録に分離して保存します。</p>`;
  } else if (type === "ledger") {
    title = `${id}の台帳詳細`;
    body = "<p>この記録は一般ポイント台帳です。事故・引渡しなどの安全記録とは分けて管理します。</p>";
  } else if (type === "notice") {
    title = id;
    body = "<p>お知らせの詳細です。正式版では運営者后台から公開し、利用者ごとの既読状態も保存します。</p>";
  } else if (state.modal === "notices") {
    title = "お知らせ一覧";
    body = notices.map(([t, d, l, tone]) => noticeRow(t, d, l, tone)).join("");
  } else if (state.modal === "expired") {
    title = "凍結・期限切れ履歴";
    body = "<p>現在、凍結・期限切れの時間クレジットはありません。</p>";
  } else if (state.modal === "ledger-empty") {
    title = "時間残高はまだありません";
    body = "<p>活動が完了し、前台で終了確認された後に、時間残高と台帳履歴が表示されます。</p>";
  } else if (state.modal === "publish-help") {
    title = "依頼公開の仕組み";
    body = "<p>保護者が地域の人に手伝ってほしい内容を公開します。公開後は后台のサービス公開に反映され、取消もできます。</p>";
  } else if (state.modal === "publish-error") {
    title = "入力が足りません";
    body = "<p>人名、地点、サービス名、サービス内容、時間通貨を入力してから公開してください。</p>";
  } else if (state.modal === "login-required") {
    title = "ログインが必要です";
    body = "<p>予約、サービス交換、台帳、前台チェックインは、本人確認できるアカウントで利用します。</p>";
  } else if (state.modal === "auth-error") {
    title = "ログイン情報を確認してください";
    body = "<p>メールアドレスとパスワードを入力してください。体験する場合は下の体験ログインも使えます。</p>";
  } else if (state.modal === "signup-email-check") {
    title = "確認メールを確認してください";
    body = "<p>Supabase のメール確認が有効になっています。届いた確認メールを開いた後、この画面からログインしてください。</p>";
  } else if (state.modal === "register-error") {
    title = "登録情報が足りません";
    body = "<p>氏名、連絡先、生活圏、子ども情報または担当可能範囲、緊急連絡先、利用目的、安全同意を入力してください。</p>";
  } else if (state.modal === "registered") {
    title = "登録が完了しました";
    body = "<p>アカウント情報を作成しました。本人確認、研修、保険状態は運営者確認後に更新されます。</p>";
  } else if (state.modal === "intro") {
    title = "時間通貨の使い方";
    body = `<div class="intro-steps"><article><strong>1. 活動する</strong><span>予約利用、地域サポート、后台公開需求の活動を前台で確認します。</span></article><article><strong>2. 時間が貯まる</strong><span>活動完了後だけ時間残高と台帳に反映されます。</span></article><article><strong>3. 交換する</strong><span>地域クーポン、子育て支援、協力店舗の特典に使えます。</span></article></div><button class="primary-button" type="button" data-dismiss-intro>わかりました。次回から表示しない</button>`;
  } else if (state.modal === "profile-edit") {
    title = "登録情報の編集";
    body = "<p>正式版ではここから氏名、生活圏、子ども情報、緊急連絡先、通知設定を更新できます。変更履歴は運営者后台に残します。</p>";
  } else if (state.modal === "verification") {
    title = "確認ステータス";
    body = "<p>本人確認、研修、保険、安全同意は別々に管理します。協力者は研修済みの範囲だけ接単できます。</p>";
  } else if (state.modal === "accept-role-blocked") {
    title = "協力者登録が必要です";
    body = "<p>地域サービスを受ける側ではなく、活動を引き受ける場合は地域協力者として登録し、本人確認・研修・保険の範囲内で利用します。</p>";
  } else if (state.modal === "training-blocked") {
    title = "安全研修後に接単できます";
    body = "<p>子どもに関わる活動は、研修済みの協力者だけが受けられます。専門保育にあたる内容は時間銀行では扱いません。</p>";
  } else if (state.modal === "accept-help") {
    title = "接単条件";
    body = "<p>協力者は研修・本人確認・保険の範囲内だけ受けられます。専門保育に当たる内容は接単できません。</p>";
  } else if (state.modal === "benefit-help") {
    title = "地域クーポン交換";
    body = "<p>活動完了後に発生した時間通貨を、地域店舗の特典へ交換できます。安全記録とは分け、一般台帳のマイナス履歴として保存します。</p>";
  } else if (state.modal === "benefit-location") {
    title = "近隣順の表示";
    body = "<p>正式版では現在地または登録生活圏に近い順で、利用可能な地域店舗特典を表示します。位置情報を使わない場合は登録エリアを基準にします。</p>";
  } else if (state.modal === "backend-publish-error") {
    title = "后台需求を入力してください";
    body = "<p>需求タイトルと需求内容は必須です。入力後、前端の「さがす」に公開されます。</p>";
  } else if (state.modal === "backend-published") {
    title = "前端に公開しました";
    body = "<p>后台で作成した需求を「さがす」の依頼を受ける欄に同期しました。利用者が受けると、ホームと后台接単リストにも反映されます。</p>";
  } else if (state.modal === "backend-missing") {
    title = "募集は終了しています";
    body = "<p>この需求は后台で終了済み、または削除されています。</p>";
  } else if (state.modal === "cloud-config-missing") {
    title = "Supabase設定が必要です";
    body = "<p>Supabase Project URL と anon / publishable key を入力してください。先に Supabase SQL Editor で `time_office_snapshots` テーブルを作成する必要があります。</p>";
  } else if (state.modal === "cloud-client-missing") {
    title = "Supabaseライブラリを読み込めません";
    body = "<p>インターネット接続、または CDN の読み込みを確認してください。オフライン時は本地保存に戻ります。</p>";
  } else if (state.modal === "cloud-connected") {
    title = "Supabaseに接続しました";
    body = "<p>预约、服务发布、接单、后台需求、时间台账会同步到云数据库。另一台手机或电脑使用同一配置打开后，会自动读取同一份数据。</p>";
  } else if (state.modal === "cloud-pushed") {
    title = "云端上传完成";
    body = "<p>当前运营数据已写入 Supabase。后续操作会继续自动同步。</p>";
  } else if (state.modal === "cloud-disconnected") {
    title = "云同步已断开";
    body = "<p>当前设备回到本地浏览器保存模式。云端已有数据不会被删除。</p>";
  } else if (state.modal === "cloud-error") {
    title = "Supabase连接失败";
    body = `<p>${state.cloud.error || "请确认 Project URL、anon key、SQL 表、RLS/权限和 Realtime 设置。"}</p>`;
  } else if (type === "metric") {
    title = `${id} の確認`;
    body = "<p>この数字は現在の画面操作からリアルタイムに計算しています。初期値は0で、予約・公開・接単・完了後だけ増えます。</p>";
  } else if (state.modal === "qr") {
    title = "QRチェックイン";
    body = "<p>共有オフィス前台のQRを読み込むと、開始・終了時刻が安全記録と台帳へ分離して保存されます。</p>";
  } else if (state.modal === "code") {
    title = "コード入力";
    body = `<label class="select-field"><span>施設コード</span><input class="modal-input" value="KITAKU-0518" /></label><button class="primary-button" type="button" data-checkin>コードで開始</button>`;
  } else if (state.modal === "checked-in") {
    title = "チェックイン完了";
    body = "<p>前台確認済みです。終了時にもう一度押すと時間クレジットが記録されます。</p>";
  } else if (state.modal === "checkin-blocked") {
    title = "先に予約または接単が必要です";
    body = "<p>時間残高は実際の活動完了後だけ発生します。オフィス・保育予約を確定するか、サービス依頼を受けてからチェックインしてください。</p>";
  } else if (state.modal === "checked-out") {
    title = "チェックアウト完了";
    const latestAmount = state.activityRecords[0]?.amount?.replace("+", "") || "0.0時間";
    body = `<p>${latestAmount}を台帳へ追加しました。現在の残高は ${state.balance.toFixed(1)} 時間です。</p>`;
  }
  return `<div class="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true"><header><h2>${title}</h2><button type="button" data-close-modal>閉じる</button></header><div class="modal-body">${body}</div></section></div>`;
}

function balanceCard() {
  if (state.balance <= 0) {
    return `<section class="balance-card pending-balance"><div><span>時間残高</span><strong class="pending-text">未発生</strong><small>活動完了後に表示されます</small></div><button type="button" data-tab="checkin">活動を完了</button></section>`;
  }
  return `<section class="balance-card"><div><span>時間残高</span><strong>${state.balance.toFixed(1)}</strong><small>有効期限 ${creditExpiryLabel()}</small></div><button type="button" data-tab="ledger">台帳へ</button></section>`;
}

function creditExpiryLabel() {
  return formatDate(addMonthsClamped(new Date(), 2));
}

function addMonthsClamped(date, months) {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function formatDateTime(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const mins = String(date.getMinutes()).padStart(2, "0");
  return `${formatDate(date)} ${hours}:${mins}`;
}

function formatShortDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

function quickButton(tab, glyph, label) {
  return `<button class="icon-button" type="button" data-tab="${tab}">${icon(glyph)}<span>${label}</span></button>`;
}

function noticeRow(title, date, label, tone) {
  return `<button class="notice" type="button" data-modal="notice:${title}"><div>${icon("chevron")}<span>${title}</span><time>${date}</time></div>${pill(label, tone)}</button>`;
}

function screenTitle(title, sub) {
  return `<div class="screen-title"><h1>${title}</h1><p>${sub}</p></div>`;
}

function pill(text, tone = "ok") {
  return `<span class="pill pill-${tone}">${text}</span>`;
}

function logo() {
  return `<div class="brand-mark" aria-label="Kitaku Time Office"><svg viewBox="0 0 48 48" role="img"><path d="M13 37V23a7 7 0 0 1 14 0v14"></path><path d="M27 37V21a6 6 0 0 1 12 0v16"></path><circle cx="20" cy="11" r="4"></circle><circle cx="33" cy="10" r="3.5"></circle></svg></div>`;
}

function icon(name) {
  const paths = {
    home: '<path d="M3 11.5 12 4l9 7.5"></path><path d="M5 10.5V20h14v-9.5"></path><path d="M9 20v-6h6v6"></path>',
    search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>',
    calendar: '<path d="M7 3v4"></path><path d="M17 3v4"></path><rect x="4" y="5" width="16" height="16" rx="2"></rect><path d="M4 10h16"></path>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path><path d="M9 13h6"></path><path d="M9 17h6"></path>',
    clipboard: '<path d="M9 4h6l1 2h3v15H5V6h3z"></path><path d="m9 13 2 2 4-5"></path>',
    qr: '<rect x="4" y="4" width="6" height="6"></rect><rect x="14" y="4" width="6" height="6"></rect><rect x="4" y="14" width="6" height="6"></rect><path d="M14 14h2v2h-2z"></path><path d="M18 14h2v6h-6v-2"></path>',
    qrBig: '<rect x="4" y="4" width="6" height="6"></rect><rect x="14" y="4" width="6" height="6"></rect><rect x="4" y="14" width="6" height="6"></rect><path d="M14 14h2v2h-2z"></path><path d="M18 14h2v6h-6v-2"></path>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path>',
    map: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"></path>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"></path>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path><circle cx="9.5" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.8"></path>',
    settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3 1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.5 1h.2a2 2 0 0 1 0 4H21a1.6 1.6 0 0 0-1.6 1z"></path>',
    chevron: '<path d="m9 18 6-6-6-6"></path>',
    user: '<path d="M20 21a8 8 0 0 0-16 0"></path><circle cx="12" cy="7" r="4"></circle>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>',
    ticket: '<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 1 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 1 0 0-4z"></path><path d="M9 9h6"></path><path d="M9 15h6"></path>',
    wallet: '<path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13"></path><path d="M16 13h4"></path>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-5"></path>',
    alert: '<path d="M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>',
    check: '<circle cx="12" cy="12" r="9"></circle><path d="m8 12 2.5 2.5L16 9"></path>'
  };
  const size = name === "qrBig" ? 132 : 20;
  const stroke = name === "qrBig" ? 1.4 : 2;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.check}</g></svg>`;
}

document.addEventListener("click", handleClick);
hydrateState();
render();
initCloudFromConfig({ silent: true });
