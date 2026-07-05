const STORAGE_KEY = "school-manager-tasks-v1";
const SETTINGS_KEY = "school-manager-settings-v1";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  tasks: [],
  settings: {
    schoolName: "",
    principalName: "",
    academicYear: "",
    preparedBy: "",
    primaryColor: "#0f766e",
    ministryLogo: "",
    schoolLogo: ""
  },
  filters: {
    search: "",
    status: "all",
    category: "all"
  },
  pendingAttachments: []
};

const categoryOptions = [
  "تعميم", "زيارة صفية", "لجنة مدرسية", "اجتماع", "صيانة", "شؤون طلاب",
  "اختبارات", "نشاط مدرسي", "مخاطبات", "متابعة ولي أمر", "أعمال إدارية", "أخرى"
];

function todayISO() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().split("T")[0];
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isLate(task) {
  return task.status !== "مكتملة" && task.dueDate && task.dueDate < todayISO();
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function load() {
  try {
    state.tasks = JSON.parse(localStorage.getItem(STORAGE_KEY)) || seedTasks();
    state.settings = { ...state.settings, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
  } catch {
    state.tasks = seedTasks();
  }
  save();
}

function seedTasks() {
  const today = todayISO();
  return [
    {
      id: uid(),
      title: "متابعة تعميم خطة الاختبارات",
      category: "تعميم",
      assignee: "لجنة الاختبارات",
      priority: "عاجل",
      status: "قيد التنفيذ",
      startDate: today,
      dueDate: today,
      description: "التأكد من وصول التعميم لجميع أعضاء اللجنة ومتابعة المطلوب قبل موعد الاختبارات.",
      notes: "مهمة تجريبية يمكن تعديلها أو حذفها.",
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: uid(),
      title: "زيارة صفية لمعلم تقنية المعلومات",
      category: "زيارة صفية",
      assignee: "مدير المدرسة",
      priority: "مهم",
      status: "جديدة",
      startDate: today,
      dueDate: "",
      description: "جدولة الزيارة وإضافة ملاحظات المتابعة بعد الانتهاء.",
      notes: "",
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
}

function applySettingsToUI() {
  $("#schoolName").value = state.settings.schoolName || "";
  $("#principalName").value = state.settings.principalName || "";
  $("#academicYear").value = state.settings.academicYear || "";
  $("#preparedBy").value = state.settings.preparedBy || "";
  $("#primaryColor").value = state.settings.primaryColor || "#0f766e";
  document.documentElement.style.setProperty("--primary", state.settings.primaryColor || "#0f766e");

  const subtitleParts = [];
  if (state.settings.schoolName) subtitleParts.push(state.settings.schoolName);
  if (state.settings.principalName) subtitleParts.push("المدير: " + state.settings.principalName);
  if (state.settings.academicYear) subtitleParts.push("العام الدراسي: " + state.settings.academicYear);
  $("#schoolSubtitle").textContent = subtitleParts.length
    ? subtitleParts.join(" — ")
    : "تنظيم المهام والتعاميم واللجان والمتابعات من مكان واحد";

  setLogo("ministryLogoBox", "ministryLogoImg", state.settings.ministryLogo);
  setLogo("schoolLogoBox", "schoolLogoImg", state.settings.schoolLogo);
}

function setLogo(boxId, imgId, value) {
  const box = $("#" + boxId);
  const img = $("#" + imgId);
  if (!box || !img) return;
  if (value) {
    img.src = value;
    box.hidden = false;
  } else {
    img.removeAttribute("src");
    box.hidden = true;
  }
}

function renderCategoryFilter() {
  const select = $("#filterCategory");
  select.innerHTML = `<option value="all">كل الأنواع</option>` + categoryOptions
    .map((cat) => `<option value="${escapeHTML(cat)}">${escapeHTML(cat)}</option>`)
    .join("");
}

function renderStats() {
  const today = todayISO();
  $("#statToday").textContent = state.tasks.filter((t) => t.dueDate === today && t.status !== "مكتملة").length;
  $("#statLate").textContent = state.tasks.filter(isLate).length;
  $("#statProgress").textContent = state.tasks.filter((t) => t.status === "قيد التنفيذ").length;
  $("#statDone").textContent = state.tasks.filter((t) => t.status === "مكتملة").length;
  $("#statUrgent").textContent = state.tasks.filter((t) => t.priority === "عاجل" && t.status !== "مكتملة").length;
}

function filteredTasks() {
  const search = state.filters.search.trim().toLowerCase();
  const today = todayISO();
  return state.tasks
    .filter((task) => {
      if (state.filters.status === "late" && !isLate(task)) return false;
      if (state.filters.status === "today" && !(task.dueDate === today && task.status !== "مكتملة")) return false;
      if (state.filters.status === "urgent" && !(task.priority === "عاجل" && task.status !== "مكتملة")) return false;
      if (!["all", "late", "today", "urgent"].includes(state.filters.status) && task.status !== state.filters.status) return false;
      if (state.filters.category !== "all" && task.category !== state.filters.category) return false;
      if (!search) return true;
      return [task.title, task.category, task.assignee, task.description, task.notes]
        .join(" ")
        .toLowerCase()
        .includes(search);
    })
    .sort((a, b) => {
      const aLate = isLate(a) ? 0 : 1;
      const bLate = isLate(b) ? 0 : 1;
      if (aLate !== bLate) return aLate - bLate;
      return (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31");
    });
}

function renderTasks() {
  const list = $("#tasksList");
  const empty = $("#emptyState");
  const tasks = filteredTasks();
  list.innerHTML = "";
  empty.hidden = tasks.length !== 0;

  const template = $("#taskTemplate");
  tasks.forEach((task) => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".task-card");
    card.dataset.id = task.id;
    if (isLate(task)) card.classList.add("task-card--late");

    const title = node.querySelector("h3");
    title.textContent = task.title;

    const meta = node.querySelector(".task-meta");
    meta.textContent = [
      task.category,
      task.assignee ? `المسؤول: ${task.assignee}` : "بدون مسؤول",
      task.dueDate ? `تاريخ الإنجاز: ${formatDate(task.dueDate)}` : "بدون تاريخ إنجاز"
    ].join(" • ");

    const status = node.querySelector(".status-pill");
    status.textContent = isLate(task) ? "متأخرة" : task.status;
    if (task.status === "مكتملة") status.classList.add("done");
    if (task.status === "قيد التنفيذ") status.classList.add("progress");

    const body = node.querySelector(".task-card__body");
    body.textContent = [task.description, task.notes ? `ملاحظات: ${task.notes}` : ""].filter(Boolean).join("\n");

    const tags = node.querySelector(".task-card__tags");
    tags.innerHTML = `
      <span class="tag">${escapeHTML(task.category)}</span>
      <span class="tag tag--priority">${escapeHTML(task.priority)}</span>
      ${isLate(task) ? '<span class="tag tag--late">تحتاج متابعة عاجلة</span>' : ""}
    `;

    const attachments = node.querySelector(".task-card__attachments");
    attachments.innerHTML = (task.attachments || []).map((file, index) => {
      const label = `${file.name} (${formatBytes(file.size)})`;
      return `<a class="attachment-link" download="${escapeHTML(file.name)}" href="${file.dataUrl}" data-index="${index}">📎 ${escapeHTML(label)}</a>`;
    }).join("");

    node.querySelector('[data-action="edit"]').addEventListener("click", () => editTask(task.id));
    node.querySelector('[data-action="done"]').addEventListener("click", () => markDone(task.id));
    node.querySelector('[data-action="delete"]').addEventListener("click", () => deleteTask(task.id));

    list.appendChild(node);
  });
}

function render() {
  applySettingsToUI();
  renderStats();
  renderTasks();
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function filesToData(files) {
  const selected = Array.from(files || []);
  const maxSize = 3 * 1024 * 1024;
  const valid = [];
  for (const file of selected) {
    if (file.size > maxSize) {
      toast(`تم تجاهل ${file.name} لأن حجمه أكبر من 3MB في نسخة التجربة.`);
      continue;
    }
    valid.push(await readFile(file));
  }
  return valid;
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      size: file.size,
      type: file.type,
      dataUrl: reader.result
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resetForm() {
  $("#taskForm").reset();
  $("#taskId").value = "";
  $("#formTitle").textContent = "إضافة مهمة جديدة";
  $("#cancelEditBtn").hidden = true;
  state.pendingAttachments = [];
  $("#attachmentPreview").innerHTML = "";
  $("#taskStart").value = todayISO();
}

function taskFromForm() {
  return {
    id: $("#taskId").value || uid(),
    title: $("#taskTitle").value.trim(),
    category: $("#taskCategory").value,
    assignee: $("#taskAssignee").value.trim(),
    priority: $("#taskPriority").value,
    status: $("#taskStatus").value,
    startDate: $("#taskStart").value,
    dueDate: $("#taskDue").value,
    description: $("#taskDescription").value.trim(),
    notes: $("#taskNotes").value.trim(),
    attachments: state.pendingAttachments,
    updatedAt: new Date().toISOString()
  };
}

function editTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  $("#taskId").value = task.id;
  $("#taskTitle").value = task.title;
  $("#taskCategory").value = task.category;
  $("#taskAssignee").value = task.assignee || "";
  $("#taskPriority").value = task.priority;
  $("#taskStatus").value = task.status;
  $("#taskStart").value = task.startDate || "";
  $("#taskDue").value = task.dueDate || "";
  $("#taskDescription").value = task.description || "";
  $("#taskNotes").value = task.notes || "";
  state.pendingAttachments = task.attachments || [];
  renderAttachmentPreview();
  $("#formTitle").textContent = "تعديل المهمة";
  $("#cancelEditBtn").hidden = false;
  $(".task-form-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

function markDone(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.status = "مكتملة";
  task.updatedAt = new Date().toISOString();
  save();
  render();
  toast("تم وضع المهمة كمكتملة.");
}

function deleteTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const ok = confirm(`هل تريد حذف المهمة: ${task.title}؟`);
  if (!ok) return;
  state.tasks = state.tasks.filter((item) => item.id !== id);
  save();
  render();
  toast("تم حذف المهمة.");
}

function renderAttachmentPreview() {
  const preview = $("#attachmentPreview");
  preview.innerHTML = state.pendingAttachments.map((file, index) => `
    <div class="preview-item">
      📎 ${escapeHTML(file.name)} — ${formatBytes(file.size)}
      <button type="button" class="btn btn--small btn--danger" data-remove-attachment="${index}">حذف</button>
    </div>
  `).join("");
  $$('[data-remove-attachment]').forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeAttachment);
      state.pendingAttachments.splice(index, 1);
      renderAttachmentPreview();
    });
  });
}

function exportBackup() {
  const data = {
    app: "لوحة متابعة أعمال مدير المدرسة",
    version: 3,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    tasks: state.tasks
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `نسخة-احتياطية-مهام-المدير-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("تم تصدير النسخة الاحتياطية.");
}

function importBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.tasks)) throw new Error("Invalid tasks");
      state.tasks = data.tasks;
      state.settings = { ...state.settings, ...(data.settings || {}) };
      save();
      render();
      toast("تم استيراد النسخة الاحتياطية بنجاح.");
    } catch {
      toast("تعذر استيراد الملف. تأكد أنه نسخة احتياطية صحيحة.");
    }
  };
  reader.readAsText(file);
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => element.classList.remove("show"), 3200);
}


function scrollToTaskForm() {
  $(".task-form-card").scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => $("#taskTitle").focus(), 450);
}

function updateQuickFilterUI(value) {
  $$('[data-quick-filter]').forEach((button) => {
    button.classList.toggle("chip--active", button.dataset.quickFilter === value);
  });
}

function updateLogoFromInput(key, file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast("الرجاء اختيار صورة فقط للشعار.");
    return;
  }
  if (file.size > 1024 * 1024) {
    toast("حجم الشعار كبير. اختر صورة أقل من 1MB للنسخة الحالية.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    state.settings[key] = reader.result;
    save();
    render();
    toast("تم حفظ الشعار في هذا المتصفح وداخل النسخة الاحتياطية.");
  };
  reader.readAsDataURL(file);
}


function updateConnectionStatus() {
  const element = $("#connectionStatus");
  if (!element) return;
  const online = navigator.onLine;
  element.textContent = online ? "متصل" : "بدون إنترنت";
  element.classList.toggle("offline", !online);
}

function showInstallGuide() {
  const dialog = $("#installDialog");
  if (!dialog) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else toast("على الهاتف: من قائمة المتصفح اختر إضافة إلى الشاشة الرئيسية.");
}

function setStatusFilter(value) {
  state.filters.status = value;
  const filter = $("#filterStatus");
  if (filter) filter.value = value;
  updateQuickFilterUI(value);
  renderTasks();
  document.querySelector(".tasks-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindEvents() {
  $("#toggleSettings").addEventListener("click", () => {
    const expanded = $("#toggleSettings").getAttribute("aria-expanded") === "true";
    $("#toggleSettings").setAttribute("aria-expanded", String(!expanded));
    $("#settingsBody").classList.toggle("collapsed", expanded);
  });

  $("#settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.settings = {
      ...state.settings,
      schoolName: $("#schoolName").value.trim(),
      principalName: $("#principalName").value.trim(),
      academicYear: $("#academicYear").value.trim(),
      preparedBy: $("#preparedBy").value.trim(),
      primaryColor: $("#primaryColor").value || "#0f766e"
    };
    save();
    render();
    toast("تم حفظ إعدادات المدرسة.");
  });

  $("#taskForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const task = taskFromForm();
    if (!task.title) return toast("يرجى كتابة عنوان المهمة.");
    const existingIndex = state.tasks.findIndex((item) => item.id === task.id);
    if (existingIndex >= 0) {
      task.createdAt = state.tasks[existingIndex].createdAt;
      state.tasks[existingIndex] = task;
      toast("تم تعديل المهمة.");
    } else {
      task.createdAt = new Date().toISOString();
      state.tasks.unshift(task);
      toast("تمت إضافة المهمة.");
    }
    save();
    render();
    resetForm();
  });

  $("#taskAttachments").addEventListener("change", async (event) => {
    const files = await filesToData(event.target.files);
    state.pendingAttachments.push(...files);
    renderAttachmentPreview();
    event.target.value = "";
  });

  $("#cancelEditBtn").addEventListener("click", resetForm);
  $("#quickAddBtn").addEventListener("click", scrollToTaskForm);
  $("#floatingAddBtn").addEventListener("click", scrollToTaskForm);
  $("#mobileAddBtn").addEventListener("click", scrollToTaskForm);
  $("#installHelpBtn").addEventListener("click", showInstallGuide);
  $("#showInstallHelpBtn").addEventListener("click", showInstallGuide);
  $("#backupBtn").addEventListener("click", exportBackup);
  $("#mobileBackupBtn").addEventListener("click", exportBackup);
  $("#importFile").addEventListener("change", (event) => importBackup(event.target.files[0]));
  $("#ministryLogo").addEventListener("change", (event) => updateLogoFromInput("ministryLogo", event.target.files[0]));
  $("#schoolLogo").addEventListener("change", (event) => updateLogoFromInput("schoolLogo", event.target.files[0]));

  $("#searchInput").addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    renderTasks();
  });
  $("#filterStatus").addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    updateQuickFilterUI(event.target.value);
    renderTasks();
  });
  $("#filterCategory").addEventListener("change", (event) => {
    state.filters.category = event.target.value;
    renderTasks();
  });

  $$('[data-quick-filter]').forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.quickFilter;
      state.filters.status = value;
      $("#filterStatus").value = value;
      updateQuickFilterUI(value);
      renderTasks();
    });
  });

  $("#resetDemoBtn").addEventListener("click", () => {
    const ok = confirm("سيتم حذف جميع مهام التجربة من هذا المتصفح. هل تريد المتابعة؟");
    if (!ok) return;
    state.tasks = [];
    save();
    render();
    resetForm();
    toast("تم مسح بيانات التجربة.");
  });
}

let deferredInstallPrompt;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const installBtn = $("#installBtn");
  installBtn.hidden = false;
  installBtn.addEventListener("click", async () => {
    installBtn.hidden = true;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  }, { once: true });
});

window.addEventListener("appinstalled", () => {
  toast("تم تثبيت التطبيق على الجهاز.");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

load();
renderCategoryFilter();
updateConnectionStatus();
bindEvents();
updateQuickFilterUI("all");
resetForm();
render();
