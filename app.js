const STORAGE_KEY = "handleliste.state.v1";
const CLOUD_CONFIG_KEY = "handleliste.cloud.config.v1";

// App-wide Supabase config for this deployment.
const EMBEDDED_CLOUD_CONFIG = {
  url: "https://rrwsqxsxwvdcfvdhfpnp.supabase.co",
  anonKey: "sb_publishable_z9KN-e2CKftRuWZktNLs3g_iNHEnP8i"
};

// Users of this deployed app join the same household by default.
// Change this value if you want to isolate data for a different family/group.
const EMBEDDED_HOUSEHOLD_SEED = "handleliste-shared-household-v1";

const DEFAULT_CATEGORIES = [
  "Frukt og grønt",
  "Meieri",
  "Kjøtt og fisk",
  "Tørrvarer",
  "Frys",
  "Bakeri",
  "Ikke-mat"
];

const els = {
  appShell: document.querySelector(".app-shell"),
  statusMessage: document.getElementById("statusMessage"),
  activeStoreLabel: document.getElementById("activeStoreLabel"),
  homeStoreSelect: document.getElementById("homeStoreSelect"),
  detectStoreBtn: document.getElementById("detectStoreBtn"),
  tabs: Array.from(document.querySelectorAll(".tab")),
  panels: Array.from(document.querySelectorAll(".panel")),
  homeStartTripBtn: document.getElementById("homeStartTripBtn"),
  homeCreateListBtn: document.getElementById("homeCreateListBtn"),
  loginBtn: document.getElementById("loginBtn"),
  authModal: document.getElementById("authModal"),
  authForm: document.getElementById("authForm"),
  authEmailInput: document.getElementById("authEmailInput"),
  authPasswordInput: document.getElementById("authPasswordInput"),
  authSubmitBtn: document.getElementById("authSubmitBtn"),
  authSignupBtn: document.getElementById("authSignupBtn"),
  authCancelBtn: document.getElementById("authCancelBtn"),
  addItemForm: document.getElementById("addItemForm"),
  itemNameInput: document.getElementById("itemNameInput"),
  itemQtyInput: document.getElementById("itemQtyInput"),
  itemCategorySelect: document.getElementById("itemCategorySelect"),
  itemSuggestions: document.getElementById("itemSuggestions"),
  startTripBtn: document.getElementById("startTripBtn"),
  exitTripBtn: document.getElementById("exitTripBtn"),
  listContainer: document.getElementById("listContainer"),
  completeListBtn: document.getElementById("completeListBtn"),
  reuseLastBtn: document.getElementById("reuseLastBtn"),
  addStoreForm: document.getElementById("addStoreForm"),
  storeSearchForm: document.getElementById("storeSearchForm"),
  storeAreaInput: document.getElementById("storeAreaInput"),
  storeSearchRadiusInput: document.getElementById("storeSearchRadiusInput"),
  searchNearMeBtn: document.getElementById("searchNearMeBtn"),
  storeSearchMeta: document.getElementById("storeSearchMeta"),
  storeSearchResults: document.getElementById("storeSearchResults"),
  activeStoreSelect: document.getElementById("activeStoreSelect"),
  storesContainer: document.getElementById("storesContainer"),
  storeOrderContainer: document.getElementById("storeOrderContainer"),
  addCategoryForm: document.getElementById("addCategoryForm"),
  categoriesContainer: document.getElementById("categoriesContainer"),
  catalogContainer: document.getElementById("catalogContainer")
};

let suggestionIndex = -1;
let suggestionData = [];

const cloud = {
  client: null,
  authListenerBound: false,
  user: null,
  householdId: null,
  syncTimer: null,
  pushTimer: null,
  syncInProgress: false,
  isApplyingRemote: false
};

let state = loadState();

bootstrap();

function bootstrap() {
  wireTabs();
  wireForms();
  wireButtons();
  wireAutocomplete();
  initCloudAuth();
  renderAll();
  registerServiceWorker();
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) : null;

  if (parsed) {
    return normalizeState(parsed);
  }

  const categories = DEFAULT_CATEGORIES.map((name) => ({
    id: uid(),
    name
  }));

  const initialList = makeList("Handleliste");

  return {
    categories,
    stores: [],
    catalog: [],
    lists: [initialList],
    activeListId: initialList.id,
    selectedStoreId: null,
    lastDetectedStoreId: null,
    updatedAt: nowIso()
  };
}

function normalizeState(input) {
  const legacyCategoryMap = {
    "Vegetables and Fruits": "Frukt og grønt",
    Dairy: "Meieri",
    "Meat and Fish": "Kjøtt og fisk",
    "Dry Goods": "Tørrvarer",
    Frozen: "Frys",
    Bakery: "Bakeri",
    "Non-Food": "Ikke-mat"
  };

  const categories = Array.isArray(input.categories) && input.categories.length > 0
    ? input.categories.map((category) => ({
      ...category,
      name: legacyCategoryMap[category.name] || category.name
    }))
    : DEFAULT_CATEGORIES.map((name) => ({ id: uid(), name }));

  const lists = Array.isArray(input.lists) && input.lists.length > 0
    ? input.lists
    : [makeList("Handleliste")];

  const activeListId = lists.some((list) => list.id === input.activeListId)
    ? input.activeListId
    : lists[0].id;

  const stores = Array.isArray(input.stores) ? input.stores.map((store) => ({
    ...store,
    categoryOrder: normalizeCategoryOrder(store.categoryOrder, categories)
  })) : [];

  return {
    categories,
    stores,
    catalog: Array.isArray(input.catalog) ? input.catalog : [],
    lists,
    activeListId,
    selectedStoreId: input.selectedStoreId || null,
    lastDetectedStoreId: input.lastDetectedStoreId || null,
    updatedAt: input.updatedAt || nowIso()
  };
}

function saveState() {
  state.updatedAt = nowIso();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!cloud.isApplyingRemote) {
    scheduleCloudPush();
  }
}

function wireTabs() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      els.tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
      els.panels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === target));
    });
  });
}

function wireForms() {
  els.addItemForm.addEventListener("submit", onAddItem);
  if (els.addStoreForm) {
    els.addStoreForm.addEventListener("submit", onAddStore);
  }
  els.storeSearchForm.addEventListener("submit", onSearchStoresByArea);
  els.addCategoryForm.addEventListener("submit", onAddCategory);
  if (els.activeStoreSelect) {
    els.activeStoreSelect.addEventListener("change", (event) => {
      const value = event.target.value;
      state.selectedStoreId = value || null;
      saveState();
      renderAll();
    });
  }
  els.homeStoreSelect.addEventListener("change", (event) => {
    const value = event.target.value;
    state.selectedStoreId = value || null;
    saveState();
    renderAll();
  });
  els.authForm.addEventListener("submit", onAuthFormSubmit);
}

function wireButtons() {
  if (els.completeListBtn) {
    els.completeListBtn.addEventListener("click", completeCurrentList);
  }
  els.reuseLastBtn.addEventListener("click", reuseLastCompletedList);
  els.detectStoreBtn.addEventListener("click", detectNearestStore);
  if (els.startTripBtn) {
    els.startTripBtn.addEventListener("click", startHandletur);
  }
  els.exitTripBtn.addEventListener("click", avsluttHandletur);
  els.homeStartTripBtn.addEventListener("click", startHandletur);
  els.homeCreateListBtn.addEventListener("click", () => {
    switchToTab("list");
    els.itemNameInput.focus();
  });
  els.loginBtn.addEventListener("click", () => {
    handleLoginButton();
  });
  if (els.authSignupBtn) {
    els.authSignupBtn.addEventListener("click", () => {
      onSignupButtonClick();
    });
  }
  els.authCancelBtn.addEventListener("click", closeAuthModal);
  els.searchNearMeBtn.addEventListener("click", onSearchStoresNearMe);
}

async function initCloudAuth() {
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    updateLoginButton();
    return;
  }

  const config = readCloudConfig();
  if (!config) {
    updateLoginButton();
    return;
  }

  if (!cloud.client) {
    cloud.client = window.supabase.createClient(config.url, config.anonKey);
  }

  const { data, error } = await cloud.client.auth.getSession();
  if (!error) {
    cloud.user = data?.session?.user || null;
  }
  updateLoginButton();
  if (cloud.user) {
    await startCloudSyncFlow();
  }

  if (!cloud.authListenerBound) {
    cloud.authListenerBound = true;
    cloud.client.auth.onAuthStateChange(async (_event, session) => {
      cloud.user = session?.user || null;
      updateLoginButton();
      if (cloud.user) {
        await startCloudSyncFlow();
      } else {
        stopCloudSyncFlow();
      }
    });
  }
}

function readCloudConfig() {
  if (EMBEDDED_CLOUD_CONFIG.url && EMBEDDED_CLOUD_CONFIG.anonKey) {
    return EMBEDDED_CLOUD_CONFIG;
  }

  const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.url || !parsed?.anonKey) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function updateLoginButton() {
  if (!els.loginBtn) {
    return;
  }
  els.loginBtn.textContent = cloud.user ? "Logg ut" : "Login";
}

async function handleLoginButton() {
  if (cloud.user && cloud.client) {
    await cloud.client.auth.signOut();
    setStatus("Logget ut.");
    return;
  }

  openAuthModal();
}

function openAuthModal() {
  els.authEmailInput.value = "";
  els.authPasswordInput.value = "";
  els.authSubmitBtn.textContent = "Logg inn";
  els.authModal.classList.add("is-open");
  els.authModal.setAttribute("aria-hidden", "false");
  els.authEmailInput.focus();
}

function closeAuthModal() {
  els.authModal.classList.remove("is-open");
  els.authModal.setAttribute("aria-hidden", "true");
  els.authPasswordInput.value = "";
  els.authSubmitBtn.textContent = "Logg inn";
}

async function onAuthFormSubmit(event) {
  event.preventDefault();

  const email = (els.authEmailInput.value || "").trim();
  const password = (els.authPasswordInput.value || "").trim();

  if (!email) {
    setStatus("Fyll ut e-post.");
    return;
  }

  if (!password) {
    setStatus("Fyll ut passord.");
    return;
  }

  await initCloudAuth();
  if (!cloud.client) {
    setStatus("Mangler Supabase-oppsett i app.js.");
    return;
  }

  const { error } = await cloud.client.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    setStatus(`Innlogging feilet: ${error.message || "ukjent feil"}`);
    return;
  }

  closeAuthModal();
  setStatus("Innlogget.");
}

async function onSignupButtonClick() {
  const email = (els.authEmailInput.value || "").trim();
  const password = (els.authPasswordInput.value || "").trim();

  if (!email) {
    setStatus("Fyll ut e-post.");
    return;
  }

  if (password.length < 6) {
    setStatus("Passord må være minst 6 tegn.");
    return;
  }

  await initCloudAuth();
  if (!cloud.client) {
    setStatus("Mangler Supabase-oppsett i app.js.");
    return;
  }

  const { error } = await cloud.client.auth.signUp({
    email,
    password
  });

  if (error) {
    const message = (error.message || "").toLowerCase();
    if (message.includes("already registered") || message.includes("already been registered")) {
      setStatus("Bruker finnes allerede. Bruk Logg inn eller Glemt passord.");
      return;
    }
    setStatus(`Oppretting feilet: ${error.message || "ukjent feil"}`);
    return;
  }

  setStatus("Bruker opprettet. Logg inn med e-post og passord.");
}

function scheduleCloudPush() {
  if (!cloud.client || !cloud.user || !cloud.householdId) {
    return;
  }
  if (cloud.pushTimer) {
    clearTimeout(cloud.pushTimer);
  }
  cloud.pushTimer = setTimeout(() => {
    pushStateToCloud();
  }, 1200);
}

async function startCloudSyncFlow() {
  if (!cloud.client || !cloud.user) {
    return;
  }

  if (cloud.syncTimer) {
    clearInterval(cloud.syncTimer);
  }

  await ensureHouseholdMembership();
  await pullStateFromCloud(true);

  cloud.syncTimer = setInterval(() => {
    pullStateFromCloud(false);
  }, 9000);

  setStatus("Sky-synk aktivert.");
}

function stopCloudSyncFlow() {
  if (cloud.syncTimer) {
    clearInterval(cloud.syncTimer);
    cloud.syncTimer = null;
  }
  if (cloud.pushTimer) {
    clearTimeout(cloud.pushTimer);
    cloud.pushTimer = null;
  }
  cloud.householdId = null;
}

async function ensureHouseholdMembership() {
  const userId = cloud.user?.id;
  if (!userId || !cloud.client) {
    return;
  }

  const configuredHouseholdId = getConfiguredSharedHouseholdId();
  if (configuredHouseholdId) {
    const { error: householdInsertError } = await cloud.client
      .from("households")
      .insert({
        id: configuredHouseholdId,
        name: "Familie",
        created_by: userId
      });

    if (householdInsertError && !isDuplicateError(householdInsertError)) {
      setStatus("Klarte ikke å sikre delt familiegruppe i skyen.");
      return;
    }

    const { error: memberInsertError } = await cloud.client
      .from("household_members")
      .insert({
        household_id: configuredHouseholdId,
        user_id: userId,
        role: "owner"
      });

    if (memberInsertError && !isDuplicateError(memberInsertError)) {
      setStatus("Klarte ikke å koble bruker til delt familiegruppe.");
      return;
    }

    cloud.householdId = configuredHouseholdId;
    return;
  }

  const { data: existingMember } = await cloud.client
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (existingMember?.household_id) {
    cloud.householdId = existingMember.household_id;
    return;
  }

  const { data: newHousehold, error: householdError } = await cloud.client
    .from("households")
    .insert({
      name: "Familie",
      created_by: userId
    })
    .select("id")
    .single();

  if (householdError || !newHousehold?.id) {
    setStatus("Klarte ikke å opprette familiegruppe i skyen.");
    return;
  }

  cloud.householdId = newHousehold.id;

  await cloud.client
    .from("household_members")
    .insert({
      household_id: cloud.householdId,
      user_id: userId,
      role: "owner"
    });
}

function getConfiguredSharedHouseholdId() {
  const seed = (EMBEDDED_HOUSEHOLD_SEED || "").trim();
  if (!seed) {
    return null;
  }
  return deterministicUuidFromSeed(seed);
}

function isDuplicateError(error) {
  const message = (error?.message || "").toLowerCase();
  return error?.code === "23505" || message.includes("duplicate key");
}

function deterministicUuidFromSeed(seed) {
  const parts = cyrb128(seed);
  const hex = parts
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");

  const chars = hex.split("");
  chars[12] = "4";
  const variantValue = parseInt(chars[16], 16);
  chars[16] = ((variantValue & 0x3) | 0x8).toString(16);

  const normalized = chars.join("");
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`;
}

function cyrb128(str) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let i = 0; i < str.length; i += 1) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0
  ];
}

function hasAnyLocalData() {
  const hasStores = state.stores.length > 0;
  const hasCatalog = state.catalog.some((entry) => !entry.deleted);
  const hasListItems = state.lists.some((list) => list.items.some((item) => !item.deleted));
  return hasStores || hasCatalog || hasListItems;
}

async function pullStateFromCloud(allowSeedFromLocal) {
  if (!cloud.client || !cloud.user || !cloud.householdId || cloud.syncInProgress) {
    return;
  }

  cloud.syncInProgress = true;

  try {
    const householdId = cloud.householdId;
    const userId = cloud.user.id;

    const [listsRes, itemsRes, storesRes, catalogRes, userStoreRes] = await Promise.all([
      cloud.client.from("shared_lists").select("*").eq("household_id", householdId).eq("deleted", false),
      cloud.client.from("shared_list_items").select("*").eq("household_id", householdId),
      cloud.client.from("shared_stores").select("*").eq("household_id", householdId).eq("deleted", false),
      cloud.client.from("shared_catalog").select("*").eq("household_id", householdId),
      cloud.client.from("user_store_state").select("*").eq("household_id", householdId).eq("user_id", userId).maybeSingle()
    ]);

    const cloudLists = listsRes.data || [];
    const cloudItems = itemsRes.data || [];
    const cloudStores = storesRes.data || [];
    const cloudCatalog = catalogRes.data || [];
    const cloudUserStore = userStoreRes.data || null;

    const hasCloudData = cloudLists.length > 0 || cloudItems.length > 0 || cloudStores.length > 0 || cloudCatalog.length > 0;

    if (!hasCloudData && allowSeedFromLocal && hasAnyLocalData()) {
      await pushStateToCloud();
      return;
    }

    if (!hasCloudData) {
      return;
    }

    const nextCategories = [...state.categories];
    const getOrCreateCategoryId = (name) => {
      const safeName = (name || "Annet").trim();
      const existing = nextCategories.find((entry) => normalizeName(entry.name) === normalizeName(safeName));
      if (existing) {
        return existing.id;
      }
      const created = { id: uid(), name: safeName };
      nextCategories.push(created);
      return created.id;
    };

    cloudItems.forEach((item) => {
      if (item.category_name) {
        getOrCreateCategoryId(item.category_name);
      }
    });

    cloudCatalog.forEach((entry) => {
      if (entry.default_category_name) {
        getOrCreateCategoryId(entry.default_category_name);
      }
    });

    cloudStores.forEach((store) => {
      const orderNames = Array.isArray(store.category_order_names) ? store.category_order_names : [];
      orderNames.forEach((name) => getOrCreateCategoryId(name));
    });

    const cloudListsWithItems = cloudLists
      .map((list) => {
        const listItems = cloudItems
          .filter((item) => item.list_id === list.id)
          .map((item) => ({
            id: item.id,
            name: item.name,
            normalized: item.normalized,
            quantity: item.quantity || "",
            categoryId: getOrCreateCategoryId(item.category_name || "Annet"),
            checked: Boolean(item.checked),
            deleted: Boolean(item.deleted),
            createdAt: item.created_at || nowIso(),
            updatedAt: item.updated_at || nowIso()
          }));

        return {
          id: list.id,
          name: list.name || "Handleliste",
          items: listItems,
          createdAt: list.created_at || nowIso(),
          completedAt: list.completed_at || null,
          updatedAt: list.updated_at || nowIso()
        };
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const cloudStoreObjects = cloudStores.map((store) => {
      const categoryOrderNames = Array.isArray(store.category_order_names) ? store.category_order_names : [];
      const mappedOrder = categoryOrderNames.map((name) => getOrCreateCategoryId(name));
      return {
        id: store.id,
        name: store.name,
        lat: Number(store.lat),
        lng: Number(store.lng),
        radiusM: Number(store.radius_m || 50),
        categoryOrder: normalizeCategoryOrder(mappedOrder, nextCategories),
        createdAt: store.created_at || nowIso(),
        updatedAt: store.updated_at || nowIso()
      };
    });

    const cloudCatalogObjects = cloudCatalog.map((entry) => ({
      id: entry.id,
      name: entry.name,
      normalized: entry.normalized,
      defaultCategoryId: getOrCreateCategoryId(entry.default_category_name || "Annet"),
      lastPurchasedAt: entry.last_purchased_at || null,
      deleted: Boolean(entry.deleted),
      createdAt: entry.created_at || nowIso(),
      updatedAt: entry.updated_at || nowIso()
    }));

    const preferredActiveList = cloudListsWithItems.find((list) => !list.completedAt)?.id;
    const activeListId = preferredActiveList || cloudListsWithItems[0]?.id || makeList("Handleliste").id;

    const nextState = {
      categories: nextCategories,
      stores: cloudStoreObjects,
      catalog: cloudCatalogObjects,
      lists: cloudListsWithItems.length > 0 ? cloudListsWithItems : [makeList("Handleliste")],
      activeListId,
      selectedStoreId: cloudUserStore?.selected_store_id || null,
      lastDetectedStoreId: cloudUserStore?.last_detected_store_id || null,
      updatedAt: nowIso()
    };

    cloud.isApplyingRemote = true;
    state = normalizeState(nextState);
    saveState();
    cloud.isApplyingRemote = false;
    renderAll();
  } catch {
    setStatus("Sky-synk feilet under nedlasting.");
  } finally {
    cloud.syncInProgress = false;
  }
}

async function pushStateToCloud() {
  if (!cloud.client || !cloud.user || !cloud.householdId || cloud.syncInProgress) {
    return;
  }

  cloud.syncInProgress = true;

  try {
    const householdId = cloud.householdId;
    const categoryNameById = new Map(state.categories.map((category) => [category.id, category.name]));

    const listRows = state.lists.map((list) => ({
      id: list.id,
      household_id: householdId,
      name: list.name,
      completed_at: list.completedAt,
      deleted: false,
      created_at: list.createdAt,
      updated_at: list.updatedAt
    }));

    const itemRows = state.lists.flatMap((list) => list.items.map((item) => ({
      id: item.id,
      household_id: householdId,
      list_id: list.id,
      name: item.name,
      normalized: item.normalized,
      quantity: item.quantity,
      category_name: categoryNameById.get(item.categoryId) || "Annet",
      checked: Boolean(item.checked),
      deleted: Boolean(item.deleted),
      created_at: item.createdAt,
      updated_at: item.updatedAt
    })));

    const storeRows = state.stores.map((store) => ({
      id: store.id,
      household_id: householdId,
      name: store.name,
      lat: store.lat,
      lng: store.lng,
      radius_m: store.radiusM,
      category_order_names: store.categoryOrder.map((id) => categoryNameById.get(id) || "Annet"),
      deleted: false,
      created_at: store.createdAt,
      updated_at: store.updatedAt
    }));

    const catalogRows = state.catalog.map((entry) => ({
      id: entry.id,
      household_id: householdId,
      name: entry.name,
      normalized: entry.normalized,
      default_category_name: categoryNameById.get(entry.defaultCategoryId) || "Annet",
      last_purchased_at: entry.lastPurchasedAt,
      deleted: Boolean(entry.deleted),
      created_at: entry.createdAt,
      updated_at: entry.updatedAt
    }));

    if (listRows.length > 0) {
      await cloud.client.from("shared_lists").upsert(listRows);
    }
    if (itemRows.length > 0) {
      await cloud.client.from("shared_list_items").upsert(itemRows);
    }
    if (storeRows.length > 0) {
      await cloud.client.from("shared_stores").upsert(storeRows);
    }
    if (catalogRows.length > 0) {
      await cloud.client.from("shared_catalog").upsert(catalogRows);
    }

    await cloud.client.from("user_store_state").upsert({
      user_id: cloud.user.id,
      household_id: householdId,
      selected_store_id: state.selectedStoreId,
      last_detected_store_id: state.lastDetectedStoreId,
      updated_at: nowIso()
    });
  } catch {
    setStatus("Sky-synk feilet under opplasting.");
  } finally {
    cloud.syncInProgress = false;
  }
}

function wireAutocomplete() {
  els.itemNameInput.addEventListener("input", () => {
    suggestionIndex = -1;
    renderAutocomplete();
  });

  els.itemNameInput.addEventListener("focus", () => {
    renderAutocomplete();
  });

  els.itemNameInput.addEventListener("keydown", (event) => {
    if (!els.itemSuggestions.classList.contains("is-open")) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      suggestionIndex = Math.min(suggestionData.length - 1, suggestionIndex + 1);
      renderAutocomplete();
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      suggestionIndex = Math.max(0, suggestionIndex - 1);
      renderAutocomplete();
    }

    if (event.key === "Enter" && suggestionIndex >= 0 && suggestionData[suggestionIndex]) {
      event.preventDefault();
      applyAutocompleteChoice(suggestionData[suggestionIndex]);
    }

    if (event.key === "Escape") {
      closeAutocomplete();
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(".item-name-wrap")) {
      return;
    }
    closeAutocomplete();
  });
}

function renderAll() {
  ensureActiveList();
  renderStoreBanner();
  renderCategorySelects();
  renderAutocomplete(true);
  renderList();
  renderStores();
  renderStoreOrderEditor();
  renderCategories();
  renderCatalog();
}

async function onSearchStoresByArea(event) {
  event.preventDefault();
  const form = new FormData(els.storeSearchForm);
  const query = (form.get("areaQuery") || "").toString().trim();
  const radiusM = Number(form.get("searchRadius"));

  if (!query) {
    setStatus("Skriv inn et område først.");
    return;
  }

  if (Number.isNaN(radiusM) || radiusM < 200) {
    setStatus("Søkeradius må være minst 200 meter.");
    return;
  }

  try {
    setStatus("Søker etter område...");
    const center = await geocodeArea(query);
    if (!center) {
      setStatus("Fant ikke området. Prøv et mer spesifikt navn.");
      return;
    }

    await runStoreSearch(center.lat, center.lon, radiusM, `Treff nær ${center.label}`, query);
  } catch {
    setStatus("Butikksøk feilet. Prøv igjen om litt.");
  }
}

function onSearchStoresNearMe() {
  const radiusM = Number(els.storeSearchRadiusInput.value || "2000");
  if (Number.isNaN(radiusM) || radiusM < 200) {
    setStatus("Søkeradius må være minst 200 meter.");
    return;
  }

  if (!navigator.geolocation) {
    setStatus("Geolokasjon er ikke tilgjengelig i denne nettleseren.");
    return;
  }

  setStatus("Henter posisjon...");
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const { latitude, longitude } = position.coords;
        await runStoreSearch(latitude, longitude, radiusM, "Treff nær din posisjon", "");
      } catch {
        setStatus("Butikksøk feilet. Prøv igjen om litt.");
      }
    },
    () => {
      setStatus("Klarte ikke å bruke posisjon. Sjekk tillatelser.");
    },
    {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 60_000
    }
  );
}

async function runStoreSearch(lat, lon, radiusM, label, areaHint = "") {
  setStatus("Henter butikker i området...");
  const results = await fetchStoresAround(lat, lon, radiusM, areaHint);
  renderStoreSearchResults(results, label);

  if (results.length === 0) {
    setStatus("Fant ingen butikker i dette området.");
    return;
  }

  setStatus(`Fant ${results.length} butikker.`);
}

async function geocodeArea(query) {
  const photonUrl = `https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(query)}`;
  const photonResponse = await fetch(photonUrl, {
    headers: {
      Accept: "application/json"
    }
  });

  if (photonResponse.ok) {
    const photonData = await photonResponse.json();
    const firstFeature = Array.isArray(photonData.features) ? photonData.features[0] : null;
    const coords = firstFeature?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const properties = firstFeature.properties || {};
      const labelParts = [properties.name, properties.city, properties.country].filter(Boolean);
      return {
        lat: Number(coords[1]),
        lon: Number(coords[0]),
        label: labelParts.join(", ") || query
      };
    }
  }

  const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=no&q=${encodeURIComponent(query)}`;
  const fallbackResponse = await fetch(fallbackUrl, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!fallbackResponse.ok) {
    return null;
  }

  const fallbackData = await fallbackResponse.json();
  if (!Array.isArray(fallbackData) || fallbackData.length === 0) {
    return null;
  }

  const first = fallbackData[0];
  return {
    lat: Number(first.lat),
    lon: Number(first.lon),
    label: first.display_name || query
  };
}

async function fetchStoresAround(lat, lon, radiusM, areaHint = "") {
  const chainTerms = ["Rema 1000", "Coop Extra", "Coop Prix", "Coop Mega", "Kiwi", "Meny", "Bunnpris", "Joker", "Spar", "Obs", "Europris"];
  const searchTerms = chainTerms.map((chain) => areaHint ? `${chain} ${areaHint}` : chain);

  const featureLists = await Promise.all(searchTerms.map(async (term) => {
    const url = `https://photon.komoot.io/api/?limit=25&lat=${lat}&lon=${lon}&q=${encodeURIComponent(term)}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    return Array.isArray(data.features) ? data.features : [];
  }));

  const features = featureLists.flat();
  const seen = new Set();

  const mapped = features
    .map((feature) => {
      const coords = feature?.geometry?.coordinates;
      const pointLon = Array.isArray(coords) ? Number(coords[0]) : NaN;
      const pointLat = Array.isArray(coords) ? Number(coords[1]) : NaN;
      if (typeof pointLat !== "number" || typeof pointLon !== "number") {
        return null;
      }
      if (Number.isNaN(pointLat) || Number.isNaN(pointLon)) {
        return null;
      }

      const properties = feature.properties || {};
      const name = (properties.name || properties.street || "Butikk").trim();
      const dedupeKey = `${normalizeName(name)}-${pointLat.toFixed(5)}-${pointLon.toFixed(5)}`;
      if (seen.has(dedupeKey)) {
        return null;
      }
      seen.add(dedupeKey);

      const addressParts = [properties.street, properties.housenumber, properties.city].filter(Boolean);
      const address = addressParts.join(" ").trim() || properties.country || "Adresse ikke oppgitt";
      const distanceM = Math.round(haversine(lat, lon, pointLat, pointLon));
      if (distanceM > radiusM) {
        return null;
      }

      const osmKey = properties.osm_key || "";
      const val = properties.osm_value || "";
      const isShop = osmKey === "shop";
      const allowedShop = isShop && ["supermarket", "convenience", "grocery", "department_store", "variety_store", "kiosk"].includes(val);
      const chainMatch = isShop && chainTerms.some((chain) => normalizeName(name).includes(normalizeName(chain)));
      if (!allowedShop && !chainMatch) {
        return null;
      }

      return {
        name,
        lat: pointLat,
        lon: pointLon,
        address,
        distanceM
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 40);

  return mapped;
}

function renderStoreSearchResults(results, label) {
  els.storeSearchResults.innerHTML = "";
  els.storeSearchMeta.textContent = results.length > 0
    ? `${label}. Viser ${results.length} butikker.`
    : `${label}. Ingen butikker funnet.`;

  if (results.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Ingen treff i valgt område.";
    els.storeSearchResults.append(empty);
    return;
  }

  results.forEach((result) => {
    const card = document.createElement("article");
    card.className = "search-result-card";

    const titleWrap = document.createElement("div");
    titleWrap.className = "search-result-title";

    const title = document.createElement("strong");
    title.textContent = result.name;

    const meta = document.createElement("span");
    meta.className = "item-sub";
    meta.textContent = `${result.address} • ${result.distanceM} m`;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn secondary";
    addBtn.textContent = "Legg til butikk";
    addBtn.addEventListener("click", () => addStoreFromSearchResult(result));

    titleWrap.append(title, meta);
    card.append(titleWrap, addBtn);
    els.storeSearchResults.append(card);
  });
}

function addStoreFromSearchResult(result) {
  const existing = state.stores.find((store) => {
    const closeEnough = haversine(store.lat, store.lng, result.lat, result.lon) < 25;
    return closeEnough || normalizeName(store.name) === normalizeName(result.name);
  });

  if (existing) {
    state.selectedStoreId = existing.id;
    saveState();
    renderAll();
    setStatus(`Butikken finnes allerede. Aktiv butikk satt til ${existing.name}.`);
    return;
  }

  const newStore = {
    id: uid(),
    name: result.name,
    lat: result.lat,
    lng: result.lon,
    radiusM: 50,
    categoryOrder: state.categories.map((category) => category.id),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  state.stores.push(newStore);
  state.selectedStoreId = newStore.id;
  saveState();
  renderAll();
  setStatus(`La til butikk ${newStore.name}.`);
}

function ensureActiveList() {
  if (!state.lists.some((list) => list.id === state.activeListId)) {
    const fresh = makeList("Handleliste");
    state.lists.push(fresh);
    state.activeListId = fresh.id;
    saveState();
  }
}

function getActiveList() {
  ensureActiveList();
  return state.lists.find((list) => list.id === state.activeListId);
}

function onAddItem(event) {
  event.preventDefault();
  const form = new FormData(els.addItemForm);
  const name = (form.get("itemName") || "").toString().trim();
  const quantity = (form.get("itemQty") || "").toString().trim();
  const categoryId = form.get("itemCategory")?.toString() || "";

  if (!name) {
    return;
  }

  const activeList = getActiveList();
  const normalized = normalizeName(name);
  const duplicate = activeList.items.some((item) => normalizeName(item.name) === normalized && !item.deleted);
  if (duplicate) {
    setStatus("Varen finnes allerede i listen.");
    return;
  }

  let catalogItem = findCatalogByName(name);
  if (!catalogItem) {
    catalogItem = {
      id: uid(),
      name,
      normalized,
      defaultCategoryId: categoryId || state.categories[0]?.id || null,
      lastPurchasedAt: null,
      deleted: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.catalog.push(catalogItem);
  } else {
    catalogItem.deleted = false;
    catalogItem.defaultCategoryId = categoryId || catalogItem.defaultCategoryId;
    catalogItem.updatedAt = nowIso();
  }

  activeList.items.push({
    id: uid(),
    name: catalogItem.name,
    normalized,
    quantity,
    categoryId: categoryId || catalogItem.defaultCategoryId,
    checked: false,
    deleted: false,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  saveState();
  els.addItemForm.reset();
  closeAutocomplete();
  renderAll();
  setStatus(`La til ${catalogItem.name}.`);
}

function onAddStore(event) {
  event.preventDefault();
  const form = new FormData(els.addStoreForm);
  const name = (form.get("storeName") || "").toString().trim();
  const lat = Number(form.get("storeLat"));
  const lng = Number(form.get("storeLng"));
  const radiusM = Number(form.get("storeRadius"));

  if (!name || Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(radiusM)) {
    setStatus("Butikkdata er ufullstendige.");
    return;
  }

  state.stores.push({
    id: uid(),
    name,
    lat,
    lng,
    radiusM,
    categoryOrder: state.categories.map((category) => category.id),
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  if (!state.selectedStoreId) {
    state.selectedStoreId = state.stores[0].id;
  }

  saveState();
  els.addStoreForm.reset();
  renderAll();
  setStatus(`Lagret butikk ${name}.`);
}

function onAddCategory(event) {
  event.preventDefault();
  const form = new FormData(els.addCategoryForm);
  const name = (form.get("categoryName") || "").toString().trim();
  if (!name) {
    return;
  }

  const category = { id: uid(), name };
  state.categories.push(category);
  state.stores = state.stores.map((store) => ({
    ...store,
    categoryOrder: [...normalizeCategoryOrder(store.categoryOrder, state.categories), category.id],
    updatedAt: nowIso()
  }));

  saveState();
  els.addCategoryForm.reset();
  renderAll();
  setStatus(`La til kategori ${name}.`);
}

function renderCategorySelects() {
  els.itemCategorySelect.innerHTML = "";
  const auto = document.createElement("option");
  auto.value = "";
  auto.textContent = "Automatisk";
  els.itemCategorySelect.append(auto);

  state.categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    els.itemCategorySelect.append(option);
  });
}

function renderAutocomplete(skipOpen = false) {
  els.itemSuggestions.innerHTML = "";
  const query = normalizeName(els.itemNameInput.value || "");
  if (!query) {
    suggestionData = [];
    closeAutocomplete();
    return;
  }

  const options = state.catalog
    .filter((item) => !item.deleted)
    .filter((item) => item.normalized.startsWith(query))
    .sort((a, b) => a.name.localeCompare(b.name));

  suggestionData = options;

  if (options.length === 0) {
    closeAutocomplete();
    return;
  }

  options.forEach((item, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = `autocomplete-option ${index === suggestionIndex ? "is-active" : ""}`;
    option.setAttribute("role", "option");
    option.textContent = item.name;
    option.addEventListener("click", () => applyAutocompleteChoice(item));
    els.itemSuggestions.append(option);
  });

  if (!skipOpen) {
    els.itemSuggestions.classList.add("is-open");
  }
}

function applyAutocompleteChoice(item) {
  els.itemNameInput.value = item.name;
  els.itemCategorySelect.value = item.defaultCategoryId || "";
  closeAutocomplete();
}

function closeAutocomplete() {
  suggestionIndex = -1;
  els.itemSuggestions.classList.remove("is-open");
  els.itemSuggestions.innerHTML = "";
}

function renderList() {
  const activeList = getActiveList();
  const items = activeList.items.filter((item) => !item.deleted);
  els.listContainer.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Ingen varer enda. Legg til første vare over.";
    els.listContainer.append(empty);
    return;
  }

  const order = getCategoryOrderForActiveStore();

  order.forEach((categoryId) => {
    const category = state.categories.find((c) => c.id === categoryId);
    if (!category) {
      return;
    }

    const groupItems = items
      .filter((item) => (item.categoryId || state.categories[0]?.id) === categoryId)
      .sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name));

    if (groupItems.length === 0) {
      return;
    }

    const group = document.createElement("section");
    group.className = "category-group";
    wireCategoryDrop(group, categoryId, activeList);

    const heading = document.createElement("h3");
    heading.textContent = category.name;
    group.append(heading);

    groupItems.forEach((item) => {
      group.append(renderListItem(item, activeList));
    });

    els.listContainer.append(group);
  });

  const uncategorized = items.filter((item) => !order.includes(item.categoryId));
  if (uncategorized.length > 0) {
    const group = document.createElement("section");
    group.className = "category-group";
    wireCategoryDrop(group, state.categories[0]?.id || null, activeList);
    const heading = document.createElement("h3");
    heading.textContent = "Annet";
    group.append(heading);
    uncategorized.forEach((item) => group.append(renderListItem(item, activeList)));
    els.listContainer.append(group);
  }
}

function renderListItem(item, list) {
  const row = document.createElement("div");
  row.className = `list-item ${item.checked ? "checked" : ""}`;
  row.draggable = true;
  row.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData("text/plain", item.id);
  });

  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = item.checked;
  check.addEventListener("change", () => {
    item.checked = check.checked;
    item.updatedAt = nowIso();
    if (item.checked) {
      const catalogItem = findCatalogByName(item.name);
      if (catalogItem) {
        catalogItem.lastPurchasedAt = nowIso();
        catalogItem.updatedAt = nowIso();
      }
    }
    saveState();
    if (shouldAutoCompleteCurrentList()) {
      autoCompleteCurrentList();
      return;
    }
    renderAll();
  });

  const main = document.createElement("div");
  main.className = "item-main";

  const title = document.createElement("strong");
  title.textContent = item.name;

  const sub = document.createElement("span");
  sub.className = "item-sub";
  sub.textContent = item.quantity ? `Antall: ${item.quantity}` : "Antall: -";

  main.append(title, sub);

  const del = document.createElement("button");
  del.className = "btn danger";
  del.type = "button";
  del.textContent = "Slett";
  del.addEventListener("click", () => {
    item.deleted = true;
    item.updatedAt = nowIso();
    list.updatedAt = nowIso();
    saveState();
    renderAll();
  });

  row.append(check, main, del);
  return row;
}

function completeCurrentList() {
  const active = getActiveList();
  if (active.items.filter((item) => !item.deleted).length === 0) {
    setStatus("Nåværende liste er tom.");
    return;
  }

  active.completedAt = nowIso();
  active.updatedAt = nowIso();

  const nextList = makeList("Handleliste");
  state.lists.push(nextList);
  state.activeListId = nextList.id;
  saveState();
  renderAll();
  setStatus("Liste fullført. Ny liste opprettet.");
}

function reuseLastCompletedList() {
  const active = getActiveList();
  const activeHasItems = active.items.some((item) => !item.deleted);
  if (activeHasItems) {
    const proceed = confirm("Nåværende liste har varer. Erstatt med forrige fullførte liste?");
    if (!proceed) {
      return;
    }
  }

  const completedLists = state.lists
    .filter((list) => Boolean(list.completedAt))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  if (completedLists.length === 0) {
    setStatus("Fant ingen fullført liste enda.");
    return;
  }

  const source = completedLists[0];
  active.items = source.items
    .filter((item) => !item.deleted)
    .map((item) => ({
      id: uid(),
      name: item.name,
      normalized: normalizeName(item.name),
      quantity: item.quantity,
      categoryId: item.categoryId,
      checked: false,
      deleted: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }));

  active.updatedAt = nowIso();
  saveState();
  renderAll();
  setStatus("Forrige fullførte liste kopiert.");
}

function wireCategoryDrop(groupElement, categoryId, list) {
  groupElement.addEventListener("dragover", (event) => {
    event.preventDefault();
    groupElement.classList.add("is-drop-target");
  });

  groupElement.addEventListener("dragleave", () => {
    groupElement.classList.remove("is-drop-target");
  });

  groupElement.addEventListener("drop", (event) => {
    event.preventDefault();
    groupElement.classList.remove("is-drop-target");
    const itemId = event.dataTransfer?.getData("text/plain");
    if (!itemId || !categoryId) {
      return;
    }

    const item = list.items.find((entry) => entry.id === itemId && !entry.deleted);
    if (!item) {
      return;
    }

    item.categoryId = categoryId;
    item.updatedAt = nowIso();

    const catalogItem = findCatalogByName(item.name);
    if (catalogItem) {
      catalogItem.defaultCategoryId = categoryId;
      catalogItem.updatedAt = nowIso();
    }

    saveState();
    renderAll();
    setStatus(`Flyttet ${item.name} til ny kategori.`);
  });
}

function renderStores() {
  els.homeStoreSelect.innerHTML = "";
  if (els.activeStoreSelect) {
    els.activeStoreSelect.innerHTML = "";
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = "Ingen aktiv butikk";
    els.activeStoreSelect.append(noneOption);
  }

  const homeNoneOption = document.createElement("option");
  homeNoneOption.value = "";
  homeNoneOption.textContent = "Ingen aktiv butikk";
  els.homeStoreSelect.append(homeNoneOption);

  state.stores.forEach((store) => {
    if (els.activeStoreSelect) {
      const option = document.createElement("option");
      option.value = store.id;
      option.textContent = store.name;
      els.activeStoreSelect.append(option);
    }

    const homeOption = document.createElement("option");
    homeOption.value = store.id;
    homeOption.textContent = store.name;
    els.homeStoreSelect.append(homeOption);
  });

  if (els.activeStoreSelect) {
    els.activeStoreSelect.value = state.selectedStoreId || "";
  }
  els.homeStoreSelect.value = state.selectedStoreId || "";

  els.storesContainer.innerHTML = "";
  if (state.stores.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Ingen butikker lagt til enda.";
    els.storesContainer.append(empty);
    return;
  }

  state.stores.forEach((store) => {
    const card = document.createElement("article");
    card.className = "store-card";

    const title = document.createElement("strong");
    title.textContent = store.name;

    const details = document.createElement("div");
    details.className = "item-sub";
    details.textContent = `Breddegrad ${store.lat.toFixed(5)}, lengdegrad ${store.lng.toFixed(5)}, radius ${store.radiusM}m`;

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const useBtn = document.createElement("button");
    useBtn.className = "btn secondary";
    useBtn.type = "button";
    useBtn.textContent = "Sett aktiv";
    useBtn.addEventListener("click", () => {
      state.selectedStoreId = store.id;
      saveState();
      renderAll();
      setStatus(`Aktiv butikk satt til ${store.name}.`);
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn danger";
    removeBtn.type = "button";
    removeBtn.textContent = "Slett butikk";
    removeBtn.addEventListener("click", () => {
      state.stores = state.stores.filter((entry) => entry.id !== store.id);
      if (state.selectedStoreId === store.id) {
        state.selectedStoreId = null;
      }
      saveState();
      renderAll();
      setStatus(`Slettet butikk ${store.name}.`);
    });

    actions.append(useBtn, removeBtn);
    card.append(title, details, actions);
    els.storesContainer.append(card);
  });
}

function renderStoreOrderEditor() {
  els.storeOrderContainer.innerHTML = "";

  const store = getActiveStore();
  if (!store) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Velg en aktiv butikk for å sortere kategorier etter butikkløype.";
    els.storeOrderContainer.append(empty);
    return;
  }

  const order = normalizeCategoryOrder(store.categoryOrder, state.categories);
  store.categoryOrder = order;

  const list = document.createElement("div");
  list.className = "store-order-list";

  order.forEach((categoryId, index) => {
    const category = state.categories.find((entry) => entry.id === categoryId);
    if (!category) {
      return;
    }

    const row = document.createElement("div");
    row.className = "store-order-row";
    row.dataset.categoryId = categoryId;
    row.title = "Dra for å endre rekkefølge";

    const name = document.createElement("strong");
    name.textContent = `${index + 1}. ${category.name}`;

    row.append(name);
    list.append(row);
  });

  els.storeOrderContainer.append(list);

  if (!window.Sortable) {
    const info = document.createElement("p");
    info.className = "item-sub";
    info.textContent = "Kunne ikke starte drag-and-drop. Last siden på nytt.";
    els.storeOrderContainer.append(info);
    return;
  }

  new window.Sortable(list, {
    animation: 140,
    draggable: ".store-order-row",
    ghostClass: "store-order-ghost",
    chosenClass: "store-order-chosen",
    dragClass: "store-order-dragging",
    onEnd: (event) => {
      const oldIndex = event.oldIndex;
      const newIndex = event.newIndex;
      if (oldIndex == null || newIndex == null || oldIndex === newIndex) {
        return;
      }

      moveInArray(store.categoryOrder, oldIndex, newIndex);
      store.updatedAt = nowIso();
      saveState();
      renderAll();
      setStatus("Kategori-rekkefølge oppdatert.");
    }
  });
}

function renderCategories() {
  els.categoriesContainer.innerHTML = "";

  state.categories.forEach((category) => {
    const row = document.createElement("div");
    row.className = "row";

    const input = document.createElement("input");
    input.type = "text";
    input.value = category.name;

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn secondary";
    saveBtn.textContent = "Gi nytt navn";
    saveBtn.addEventListener("click", () => {
      const nextName = input.value.trim();
      if (!nextName) {
        return;
      }
      category.name = nextName;
      saveState();
      renderAll();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn danger";
    removeBtn.textContent = "Slett";
    removeBtn.disabled = state.categories.length <= 1;
    removeBtn.addEventListener("click", () => deleteCategory(category.id));

    actions.append(saveBtn, removeBtn);
    row.append(input, actions);
    els.categoriesContainer.append(row);
  });
}

function deleteCategory(categoryId) {
  if (state.categories.length <= 1) {
    return;
  }

  const replacement = state.categories.find((category) => category.id !== categoryId);
  if (!replacement) {
    return;
  }

  state.categories = state.categories.filter((category) => category.id !== categoryId);

  state.lists.forEach((list) => {
    list.items.forEach((item) => {
      if (item.categoryId === categoryId) {
        item.categoryId = replacement.id;
      }
    });
  });

  state.catalog.forEach((item) => {
    if (item.defaultCategoryId === categoryId) {
      item.defaultCategoryId = replacement.id;
    }
  });

  state.stores = state.stores.map((store) => ({
    ...store,
    categoryOrder: normalizeCategoryOrder(store.categoryOrder.filter((id) => id !== categoryId), state.categories),
    updatedAt: nowIso()
  }));

  saveState();
  renderAll();
}

function renderCatalog() {
  els.catalogContainer.innerHTML = "";

  const entries = state.catalog
    .filter((item) => !item.deleted)
    .sort((a, b) => {
      const aTime = a.lastPurchasedAt || a.createdAt;
      const bTime = b.lastPurchasedAt || b.createdAt;
      return bTime.localeCompare(aTime);
    });

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Ingen lagrede varer enda.";
    els.catalogContainer.append(empty);
    return;
  }

  entries.forEach((item) => {
    const row = document.createElement("div");
    row.className = "row";

    const title = document.createElement("strong");
    title.textContent = item.name;

    const category = state.categories.find((entry) => entry.id === item.defaultCategoryId);
    const meta = document.createElement("span");
    meta.className = "item-sub";
    meta.textContent = `Kategori: ${category ? category.name : "Ukjent"}. Sist kjøpt: ${formatTime(item.lastPurchasedAt)}`;

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const quickAddBtn = document.createElement("button");
    quickAddBtn.type = "button";
    quickAddBtn.className = "btn secondary";
    quickAddBtn.textContent = "Legg til i liste";
    quickAddBtn.addEventListener("click", () => {
      els.itemNameInput.value = item.name;
      els.itemCategorySelect.value = item.defaultCategoryId || "";
      switchToTab("list");
      els.itemNameInput.focus();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn danger";
    deleteBtn.textContent = "Slett fra historikk";
    deleteBtn.addEventListener("click", () => {
      item.deleted = true;
      item.updatedAt = nowIso();
      saveState();
      renderAll();
      setStatus(`Slettet ${item.name} fra historikk.`);
    });

    actions.append(quickAddBtn, deleteBtn);
    row.append(title, meta, actions);
    els.catalogContainer.append(row);
  });
}

function renderStoreBanner() {
  const store = getActiveStore();
  if (store) {
    els.activeStoreLabel.textContent = store.name;
  } else {
    els.activeStoreLabel.textContent = "Velg butikk";
  }
}

function shouldAutoCompleteCurrentList() {
  const active = getActiveList();
  const visibleItems = active.items.filter((entry) => !entry.deleted);
  return visibleItems.length > 0 && visibleItems.every((entry) => entry.checked);
}

function autoCompleteCurrentList() {
  const active = getActiveList();
  active.completedAt = nowIso();
  active.updatedAt = nowIso();

  const nextList = makeList("Handleliste");
  state.lists.push(nextList);
  state.activeListId = nextList.id;
  saveState();
  renderAll();
  setStatus("Alle varer er handlet. Ny liste er opprettet.");
}

function detectNearestStore() {
  if (!navigator.geolocation) {
    setStatus("Geolokasjon er ikke tilgjengelig i denne nettleseren.");
    return;
  }

  if (state.stores.length === 0) {
    setStatus("Legg til minst én butikk først.");
    return;
  }

  setStatus("Finner nærmeste butikk...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      const nearest = state.stores
        .map((store) => ({ store, distance: haversine(latitude, longitude, store.lat, store.lng) }))
        .sort((a, b) => a.distance - b.distance)[0];

      if (!nearest) {
        setStatus("Fant ingen butikker i nærheten.");
        return;
      }

      if (nearest.distance <= nearest.store.radiusM) {
        state.selectedStoreId = nearest.store.id;
        state.lastDetectedStoreId = nearest.store.id;
        saveState();
        renderAll();
        setStatus(`Fant ${nearest.store.name}. Avstand ${Math.round(nearest.distance)}m, GPS-nøyaktighet ${Math.round(accuracy)}m.`);
      } else {
        setStatus(`Nærmeste er ${nearest.store.name} på ${Math.round(nearest.distance)}m, utenfor radius.`);
      }
    },
    () => {
      setStatus("Klarte ikke å finne posisjon. Sjekk tillatelser.");
    },
    {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 60_000
    }
  );
}

function getActiveStore() {
  return state.stores.find((store) => store.id === state.selectedStoreId) || null;
}

function getCategoryOrderForActiveStore() {
  const store = getActiveStore();
  if (!store) {
    return state.categories.map((category) => category.id);
  }
  return normalizeCategoryOrder(store.categoryOrder, state.categories);
}

function switchToTab(name) {
  const tab = els.tabs.find((entry) => entry.dataset.tab === name);
  if (tab) {
    tab.click();
  }
}

function findCatalogByName(name) {
  const normalized = normalizeName(name);
  return state.catalog.find((item) => item.normalized === normalized) || null;
}

function normalizeCategoryOrder(order, categories) {
  const categoryIds = categories.map((category) => category.id);
  const set = new Set(Array.isArray(order) ? order.filter((id) => categoryIds.includes(id)) : []);
  categoryIds.forEach((id) => set.add(id));
  return Array.from(set);
}

function moveInArray(array, from, to) {
  if (to < 0 || to >= array.length || from === to) {
    return;
  }
  const [entry] = array.splice(from, 1);
  array.splice(to, 0, entry);
}

function setStatus(message) {
  els.statusMessage.textContent = message;
}

function normalizeName(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatTime(value) {
  if (!value) {
    return "Aldri";
  }
  const date = new Date(value);
  return date.toLocaleString("nb-NO");
}

function startHandletur() {
  switchToTab("list");
  document.body.classList.add("trip-mode");
}

function avsluttHandletur() {
  document.body.classList.remove("trip-mode");
}

function uid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function makeList(name) {
  return {
    id: uid(),
    name,
    items: [],
    createdAt: nowIso(),
    completedAt: null,
    updatedAt: nowIso()
  };
}

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (value) => value * Math.PI / 180;
  const earthRadiusM = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusM * c;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").then((registration) => {
        let refreshing = false;

        const activateWaitingWorker = () => {
          if (!registration.waiting) {
            return;
          }
          setStatus("Ny versjon klar. Oppdaterer app...");
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        };

        activateWaitingWorker();

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) {
            return;
          }

          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              activateWaitingWorker();
            }
          });
        });

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) {
            return;
          }
          refreshing = true;
          window.location.reload();
        });

        setInterval(() => {
          registration.update().catch(() => {
            // Ignore transient update check failures.
          });
        }, 60 * 1000);
      }).catch(() => {
        setStatus("Klarte ikke å registrere service worker.");
      });
    });
  }
}
