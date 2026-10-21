
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyApmBBYF0aQSZt51htNpk4g8vQJ1ay2HRs",
  authDomain: "phenomapals.firebaseapp.com",
  databaseURL: "https://phenomapals-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "phenomapals",
  storageBucket: "phenomapals.firebasestorage.app",
  messagingSenderId: "455577206971",
  appId: "1:455577206971:web:ab6e48119de0d0f94ae99e",
  measurementId: "G-MS66DQFHLG"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const teachersCollection = collection(db, "teachers");
const studentsCollection = collection(db, "students");
const logsCollection = collection(db, "activityLogs");

let teachers = [];
let students = [];
let logs = [];

let batchType = "teachers";
let editDocId = null;
let isLoggingIn = false;
let isClearingLogs = false;
let popupResolver = null;
let popupQueue = Promise.resolve();
let realtimeUnsubscribers = [];
let realtimeActive = false;
let realtimeStarted = false;
let realtimeReady = {
  teachers: false,
  students: false,
  logs: false
};

function createPopupSystem() {
  if (document.getElementById("customPopupOverlay")) return;

  const style = document.createElement("style");

  style.textContent = `
    #customPopupOverlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(5px);
    }

    #customPopupOverlay.hidden {
      display: none;
    }

    #customPopupBox {
      width: 100%;
      max-width: 410px;
      padding: 28px;
      border: 1px solid #dce5f5;
      border-radius: 16px;
      background: #ffffff;
      color: #172033;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      font-family: Poppins, Arial, sans-serif;
      animation: phenomapalsPopupIn 0.2s ease-out;
    }

    #customPopupIcon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
      border-radius: 50%;
      font-size: 25px;
      font-weight: 700;
    }

    #customPopupTitle {
      margin: 0 0 10px;
      font-size: 20px;
      font-weight: 700;
    }

    #customPopupMessage {
      margin: 0 0 24px;
      color: #596579;
      font-size: 14px;
      line-height: 1.7;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }

    #customPopupActions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    #customPopupActions button {
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    #customPopupConfirm {
      background: #0d1e58;
      color: #ffffff;
    }

    #customPopupConfirm:hover {
      background: #1aeeef;
      color: #06092f;
    }

    #customPopupCancel {
      background: #edf1f7;
      color: #374151;
    }

    #customPopupCancel:hover {
      background: #dce4ef;
    }

    #customPopupActions button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    @keyframes phenomapalsPopupIn {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.97);
      }

      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @media (max-width: 480px) {
      #customPopupBox {
        padding: 22px;
      }
    }
  `;

  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.id = "customPopupOverlay";
  overlay.className = "hidden";

  const box = document.createElement("div");
  box.id = "customPopupBox";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "customPopupTitle");
  box.setAttribute("aria-describedby", "customPopupMessage");

  const icon = document.createElement("div");
  icon.id = "customPopupIcon";

  const heading = document.createElement("h3");
  heading.id = "customPopupTitle";

  const message = document.createElement("p");
  message.id = "customPopupMessage";

  const actions = document.createElement("div");
  actions.id = "customPopupActions";

  const cancelButton = document.createElement("button");
  cancelButton.id = "customPopupCancel";
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";

  const confirmButton = document.createElement("button");
  confirmButton.id = "customPopupConfirm";
  confirmButton.type = "button";
  confirmButton.textContent = "OK";

  actions.append(cancelButton, confirmButton);
  box.append(icon, heading, message, actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  confirmButton.addEventListener("click", () => finishPopup(true));
  cancelButton.addEventListener("click", () => finishPopup(false));

  overlay.addEventListener("click", event => {
    if (event.target === overlay) {
      finishPopup(false);
    }
  });

  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      !overlay.classList.contains("hidden")
    ) {
      finishPopup(false);
    }
  });
}

function finishPopup(result) {
  const overlay = document.getElementById("customPopupOverlay");

  if (!overlay || overlay.classList.contains("hidden")) return;

  overlay.classList.add("hidden");

  const resolver = popupResolver;
  popupResolver = null;

  if (resolver) resolver(result);
}

function showPopup(message, options = {}) {
  createPopupSystem();

  const task = popupQueue.then(() => new Promise(resolve => {
    popupResolver = resolve;

    const overlay = document.getElementById("customPopupOverlay");
    const icon = document.getElementById("customPopupIcon");
    const heading = document.getElementById("customPopupTitle");
    const messageElement = document.getElementById("customPopupMessage");
    const cancelButton = document.getElementById("customPopupCancel");
    const confirmButton = document.getElementById("customPopupConfirm");

    const {
      title = "Notification",
      type = "info",
      confirm = false
    } = options;

    const appearances = {
      success: {
        symbol: "✓",
        color: "#15803d",
        bg: "#dcfce7"
      },
      error: {
        symbol: "✕",
        color: "#b91c1c",
        bg: "#fee2e2"
      },
      warning: {
        symbol: "!",
        color: "#b45309",
        bg: "#fef3c7"
      },
      info: {
        symbol: "i",
        color: "#0d1e58",
        bg: "#dbeafe"
      }
    };

    const appearance = appearances[type] || appearances.info;

    icon.textContent = appearance.symbol;
    icon.style.color = appearance.color;
    icon.style.background = appearance.bg;

    heading.textContent = title;
    messageElement.textContent = String(message);

    cancelButton.style.display = confirm ? "" : "none";
    confirmButton.textContent = confirm ? "Confirm" : "OK";

    overlay.classList.remove("hidden");
    confirmButton.focus();
  }));

  popupQueue = task.then(
    () => undefined,
    () => undefined
  );

  return task;
}

function showMessage(message, type = "info", title = "") {
  const titles = {
    success: "Success",
    error: "Error",
    warning: "Attention",
    info: "Notification"
  };

  return showPopup(message, {
    type,
    title: title || titles[type] || "Notification"
  });
}

function showConfirm(message, title = "Confirm Action") {
  return showPopup(message, {
    title,
    type: "warning",
    confirm: true
  });
}

function getStudentStartingAttributes() {
  return {
    level: 0,
    iq: 0,
    coins: 150,
    diamonds: 150,
    hasHatched: false,
    tutorialDone: false
  };
}

function normalizeType(type) {
  return type === "teacher" || type === "teachers"
    ? "teachers"
    : "students";
}

function getCollection(type) {
  return normalizeType(type) === "teachers"
    ? teachersCollection
    : studentsCollection;
}

function getRecords(type) {
  return normalizeType(type) === "teachers"
    ? teachers
    : students;
}

function getByDocId(type, docId) {
  return getRecords(type).find(record => record.docId === docId);
}

async function loadCollection(collectionRef) {
  const snapshot = await getDocs(collectionRef);

  return snapshot.docs.map(item => ({
    ...item.data(),
    docId: item.id
  }));
}

function startRealtimeListeners() {
  if (realtimeActive) return;

  realtimeActive = true;
  realtimeStarted = true;

  realtimeReady = {
    teachers: false,
    students: false,
    logs: false
  };

  const handleError = (collectionName, error) => {
    console.error(
      `Real-time ${collectionName} listener error:`,
      error
    );

    void showMessage(
      `Unable to receive live updates for ${collectionName}. Please check your internet connection and Firestore Security Rules.`,
      "error"
    );
  };

  const unsubscribeTeachers = onSnapshot(
    teachersCollection,
    snapshot => {
      teachers = snapshot.docs.map(item => ({
        ...item.data(),
        docId: item.id
      }));

      realtimeReady.teachers = true;
      updateUI();
    },
    error => handleError("teachers", error)
  );

  const unsubscribeStudents = onSnapshot(
    studentsCollection,
    snapshot => {
      students = snapshot.docs.map(item => ({
        ...item.data(),
        docId: item.id
      }));

      realtimeReady.students = true;
      updateUI();
    },
    error => handleError("students", error)
  );

  const unsubscribeLogs = onSnapshot(
    logsCollection,
    snapshot => {
      logs = snapshot.docs.map(item => ({
        ...item.data(),
        docId: item.id
      }));

      realtimeReady.logs = true;
      renderLogs();
    },
    error => handleError("activityLogs", error)
  );

  realtimeUnsubscribers = [
    unsubscribeTeachers,
    unsubscribeStudents,
    unsubscribeLogs
  ];

  console.log("Firestore real-time listeners started.");
}

function stopRealtimeListeners() {
  realtimeUnsubscribers.forEach(unsubscribe => unsubscribe());

  realtimeUnsubscribers = [];
  realtimeActive = false;
  realtimeReady = {
    teachers: false,
    students: false,
    logs: false
  };

  console.log("Firestore real-time listeners stopped.");
}

async function isAccountIdTaken(
  accountId,
  currentType,
  currentDocId = null
) {
  const normalizedId = String(accountId ?? "")
    .trim()
    .toLowerCase();

  if (!normalizedId) return false;

  const collectionsToCheck = [
    { name: "teachers", ref: teachersCollection },
    { name: "students", ref: studentsCollection }
  ];

  for (const target of collectionsToCheck) {
    const snapshot = await getDocs(target.ref);

    const duplicateFound = snapshot.docs.some(documentSnapshot => {
      if (
        currentDocId &&
        target.name === normalizeType(currentType) &&
        documentSnapshot.id === currentDocId
      ) {
        return false;
      }

      const data = documentSnapshot.data();

      const existingId = String(data.id ?? "")
        .trim()
        .toLowerCase();

      return existingId === normalizedId;
    });

    if (duplicateFound) return true;
  }

  return false;
}

async function loadAllData() {
  if (realtimeActive) return true;

  try {
    const [newTeachers, newStudents, newLogs] = await Promise.all([
      loadCollection(teachersCollection),
      loadCollection(studentsCollection),
      loadCollection(logsCollection)
    ]);

    teachers = newTeachers;
    students = newStudents;
    logs = newLogs;

    updateUI();
    renderLogs();

    console.log("Data loaded successfully.");
    return true;
  } catch (error) {
    console.error("Firestore loading error:", error);

    void showMessage(
      "Unable to load data from Firestore. Please check your internet connection and Firestore Security Rules.",
      "error"
    );

    return false;
  }
}

async function addLog(message) {
  try {
    await addDoc(logsCollection, {
      msg: message,
      time: new Date().toLocaleString("en-US"),
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Activity log error:", error);
  }
}

function renderLogs() {
  const container = document.getElementById("logContent");
  if (!container) return;

  container.replaceChildren();

  const sortedLogs = [...logs].sort((a, b) => {
    const timeA = a.createdAt?.seconds || 0;
    const timeB = b.createdAt?.seconds || 0;
    return timeB - timeA;
  });

  if (!sortedLogs.length) {
    container.textContent = "No activity logs available.";
    return;
  }

  sortedLogs.forEach(entry => {
    const row = document.createElement("div");
    row.className = "log-entry";

    const message = document.createElement("span");
    message.textContent = entry.msg || "";

    const time = document.createElement("small");
    time.textContent = entry.time || "";

    row.append("[ " + time.textContent + " ] ", message);
    container.appendChild(row);
  });
}

async function clearLogs() {
  if (isClearingLogs) return;

  const confirmed = await showConfirm(
    "Are you sure you want to permanently delete all activity logs? This action cannot be undone.",
    "Clear Activity Logs"
  );

  if (!confirmed) return;

  isClearingLogs = true;

  try {
    const snapshot = await getDocs(logsCollection);

    if (snapshot.empty) {
      void showMessage(
        "There are no activity logs to clear.",
        "warning"
      );
      return;
    }

    const documents = snapshot.docs;

    for (let i = 0; i < documents.length; i += 500) {
      const batch = writeBatch(db);
      const chunk = documents.slice(i, i + 500);

      chunk.forEach(logDocument => {
        batch.delete(logDocument.ref);
      });

      await batch.commit();
    }

    void showMessage(
      "All activity logs have been permanently deleted.",
      "success"
    );
  } catch (error) {
    console.error("Clear logs error:", error);

    if (!realtimeActive) {
      await loadAllData();
    }

    void showMessage(
      "Unable to clear activity logs. Please check your Firestore permissions and try again.",
      "error"
    );
  } finally {
    isClearingLogs = false;
  }
}

async function addTeacher(name, id, pass) {
  try {
    if (await isAccountIdTaken(id, "teachers")) {
      void showMessage(
        `Account ID "${id}" is already used by a teacher or student.`,
        "warning"
      );
      return;
    }

    await addDoc(teachersCollection, {
      name: name.trim(),
      id: id.trim(),
      pass,
      archived: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await addLog(`Teacher added successfully: ${name}`);

    if (!realtimeActive && !await loadAllData()) {
      void showMessage(
        "The teacher was saved, but the table could not be refreshed.",
        "warning"
      );
      return;
    }

    void showMessage("Teacher added successfully.", "success");
  } catch (error) {
    console.error("Add teacher error:", error);

    void showMessage(
      "Unable to add the teacher. Please try again.",
      "error"
    );
  }
}

async function addStudent(name, id, sec, pass) {
  try {
    if (await isAccountIdTaken(id, "students")) {
      void showMessage(
        `Account ID "${id}" is already used by a teacher or student.`,
        "warning"
      );
      return;
    }

    await addDoc(studentsCollection, {
      name: name.trim(),
      id: id.trim(),
      sec,
      pass,
      ...getStudentStartingAttributes(),
      archived: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await addLog(`Student added successfully: ${name}`);

    if (!realtimeActive && !await loadAllData()) {
      void showMessage(
        "The student was saved, but the table could not be refreshed.",
        "warning"
      );
      return;
    }

    void showMessage("Student added successfully.", "success");
  } catch (error) {
    console.error("Add student error:", error);

    void showMessage(
      "Unable to add the student. Please try again.",
      "error"
    );
  }
}

async function editTeacher(docId, name, id, pass) {
  try {
    if (await isAccountIdTaken(id, "teachers", docId)) {
      void showMessage(
        `Account ID "${id}" is already used by a teacher or student.`,
        "warning"
      );
      return;
    }

    await updateDoc(doc(teachersCollection, docId), {
      name: name.trim(),
      id: id.trim(),
      pass,
      updatedAt: serverTimestamp()
    });

    await addLog(`Teacher updated successfully: ${name}`);

    if (!realtimeActive && !await loadAllData()) {
      void showMessage(
        "The teacher was updated, but the table could not be refreshed.",
        "warning"
      );
      return;
    }

    void showMessage("Teacher updated successfully.", "success");
  } catch (error) {
    console.error("Edit teacher error:", error);

    void showMessage(
      "Unable to update the teacher. Please try again.",
      "error"
    );
  }
}

async function editStudent(docId, name, id, sec, pass) {
  try {
    if (await isAccountIdTaken(id, "students", docId)) {
      void showMessage(
        `Account ID "${id}" is already used by a teacher or student.`,
        "warning"
      );
      return;
    }

    await updateDoc(doc(studentsCollection, docId), {
      name: name.trim(),
      id: id.trim(),
      sec,
      pass,
      updatedAt: serverTimestamp()
    });

    await addLog(`Student updated successfully: ${name}`);

    if (!realtimeActive && !await loadAllData()) {
      void showMessage(
        "The student was updated, but the table could not be refreshed.",
        "warning"
      );
      return;
    }

    void showMessage("Student updated successfully.", "success");
  } catch (error) {
    console.error("Edit student error:", error);

    void showMessage(
      "Unable to update the student. Please try again.",
      "error"
    );
  }
}

async function setArchived(type, docId, archived) {
  type = normalizeType(type);

  const record = getByDocId(type, docId);

  if (!record) {
    void showMessage(
      "Record not found. Please refresh the page.",
      "warning"
    );
    return;
  }

  const action = archived ? "archive" : "restore";

  const confirmed = await showConfirm(
    `Are you sure you want to ${action} ${record.name}?`,
    `Confirm ${action}`
  );

  if (!confirmed) return;

  try {
    await updateDoc(doc(getCollection(type), docId), {
      archived,
      updatedAt: serverTimestamp()
    });

    await addLog(
      archived
        ? `Record archived successfully: ${record.name}`
        : `Record restored successfully: ${record.name}`
    );

    if (!realtimeActive && !await loadAllData()) {
      void showMessage(
        "The operation completed, but the tables could not be refreshed.",
        "warning"
      );
      return;
    }

    void showMessage(
      archived
        ? "Record archived successfully."
        : "Record restored successfully.",
      "success"
    );
  } catch (error) {
    console.error("Archive/restore error:", error);

    void showMessage(
      "Unable to update the record. Please try again.",
      "error"
    );
  }
}

async function bulkToggleArchive(type, targetState) {
  type = normalizeType(type);

  const className = targetState
    ? `${type}-cb`
    : `${type}-archive-cb`;

  const tableId = targetState
    ? type === "teachers" ? "tTable" : "sTable"
    : type === "teachers" ? "atTable" : "asTable";

  const table = document.getElementById(tableId);

  const checkboxes = table
    ? [...table.querySelectorAll(`.${className}:checked`)]
    : [];

  const selected = checkboxes
    .map(box => getByDocId(type, box.dataset.docId))
    .filter(Boolean);

  if (!selected.length) {
    void showMessage(
      "Please select at least one record.",
      "warning"
    );
    return;
  }

  const action = targetState ? "archive" : "restore";

  const confirmed = await showConfirm(
    `Are you sure you want to ${action} ${selected.length} selected record(s)?`,
    `Confirm ${action}`
  );

  if (!confirmed) return;

  try {
    for (let i = 0; i < selected.length; i += 500) {
      const batch = writeBatch(db);
      const chunk = selected.slice(i, i + 500);

      chunk.forEach(record => {
        batch.update(doc(getCollection(type), record.docId), {
          archived: targetState,
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();
    }

    await addLog(
      `${selected.length} ${type} record(s) ${
        targetState ? "archived" : "restored"
      } successfully.`
    );

    if (!realtimeActive && !await loadAllData()) {
      void showMessage(
        "The operation completed, but the tables could not be refreshed.",
        "warning"
      );
      return;
    }

    void showMessage(
      `${selected.length} record(s) ${
        targetState ? "archived" : "restored"
      } successfully.`,
      "success"
    );
  } catch (error) {
    console.error("Bulk archive/restore error:", error);

    void showMessage(
      "The bulk operation could not be completed.",
      "error"
    );
  }
}

function getCheckboxGroup(type, isArchive = false) {
  type = normalizeType(type);

  const masterId = isArchive
    ? type === "teachers"
      ? "selectAllArchivedT"
      : "selectAllArchivedS"
    : type === "teachers"
      ? "selectAllT"
      : "selectAllS";

  const className = isArchive
    ? `${type}-archive-cb`
    : `${type}-cb`;

  const tableId = isArchive
    ? type === "teachers"
      ? "atTable"
      : "asTable"
    : type === "teachers"
      ? "tTable"
      : "sTable";

  const table = document.getElementById(tableId);
  const master = document.getElementById(masterId);

  const checkboxes = table
    ? [...table.querySelectorAll(`.${className}`)]
    : [];

  return { master, checkboxes };
}

function updateSelectAllState(type, isArchive = false) {
  const { master, checkboxes } = getCheckboxGroup(type, isArchive);

  if (!master) return;

  const checkedCount = checkboxes.filter(
    checkbox => checkbox.checked
  ).length;

  master.checked =
    checkboxes.length > 0 &&
    checkedCount === checkboxes.length;

  master.indeterminate =
    checkedCount > 0 &&
    checkedCount < checkboxes.length;
}

function toggleSelectAll(type, isArchive = false) {
  const { master, checkboxes } = getCheckboxGroup(type, isArchive);

  if (!master) return;

  checkboxes.forEach(checkbox => {
    checkbox.checked = master.checked;
  });

  updateSelectAllState(type, isArchive);
}

function renderTable(tableId, data, type, isArchive = false) {
  type = normalizeType(type);

  const tbody = document.getElementById(tableId);
  if (!tbody) return;

  tbody.replaceChildren();

  const records = data.filter(item =>
    Boolean(item.archived) === isArchive
  );

  records.forEach(item => {
    const tr = document.createElement("tr");

    const checkboxCell = document.createElement("td");
    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.className = isArchive
      ? `${type}-archive-cb`
      : `${type}-cb`;

    checkbox.dataset.docId = item.docId;
    checkbox.classList.add("select-box");

    checkbox.addEventListener("change", () => {
      updateSelectAllState(type, isArchive);
    });

    checkboxCell.appendChild(checkbox);
    tr.appendChild(checkboxCell);

    const nameCell = document.createElement("td");
    nameCell.textContent = item.name || "";
    tr.appendChild(nameCell);

    const idCell = document.createElement("td");
    idCell.textContent = item.id || "";
    tr.appendChild(idCell);

    if (type === "students" && !isArchive) {
      const sectionCell = document.createElement("td");
      sectionCell.textContent = item.sec || "";
      tr.appendChild(sectionCell);
    }

    if (isArchive) {
      const statusCell = document.createElement("td");
      statusCell.textContent = "Archived ";
      tr.appendChild(statusCell);
    } else {
      const actionCell = document.createElement("td");
      const editButton = document.createElement("button");

      editButton.type = "button";
      editButton.className = "row-edit-btn";
      editButton.title = "Edit record";
      editButton.setAttribute("aria-label", "Edit record");

      const icon = document.createElement("i");
      icon.className = "fas fa-edit";

      editButton.appendChild(icon);

      editButton.addEventListener("click", () => {
        openBatchModal(type, item.docId);
      });

      actionCell.append(editButton);
      tr.appendChild(actionCell);
    }

    tbody.appendChild(tr);
  });

  updateSelectAllState(type, isArchive);
}

function renderSectionTable() {
  const tbody = document.getElementById("secTableBody");
  const filter = document.getElementById("sectionFilter");

  if (!tbody || !filter) return;

  tbody.replaceChildren();

  students
    .filter(student =>
      !student.archived &&
      (!filter.value || student.sec === filter.value)
    )
    .forEach(student => {
      const tr = document.createElement("tr");

      [student.name, student.id, student.sec].forEach(value => {
        const td = document.createElement("td");
        td.textContent = value || "";
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
}

function exportToExcel() {
  const section =
    document.getElementById("sectionFilter")?.value || "";

  const records = students.filter(student =>
    !student.archived &&
    (!section || student.sec === section)
  );

  const escapeCSV = value =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const rows = [
    ["Name", "Account ID", "Section"],
    ...records.map(student => [
      student.name,
      student.id,
      student.sec
    ])
  ];

  const csv = rows
    .map(row => row.map(escapeCSV).join(","))
    .join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download =
    `PhenomaPals_${section.replace(/\s/g, "") || "Students"}.csv`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  void addLog(`CSV exported successfully: ${section || "All sections"}`);

  void showMessage("CSV exported successfully.", "success");
}

function openBatchModal(type, docId = null) {
  batchType = normalizeType(type);
  editDocId = docId;

  const modal = document.getElementById("batchUserModal");
  const header = document.getElementById("modalTableHead");
  const tbody = document.getElementById("modalTableBody");
  const title = document.getElementById("batchModalTitle");
  const addButton = document.getElementById("addLayerBtn");

  if (!modal || !header || !tbody) {
    console.error("Batch modal elements not found.");

    void showMessage(
      "The registration form could not be opened.",
      "error"
    );
    return;
  }

  tbody.replaceChildren();

  if (title) {
    title.textContent = docId
      ? `Edit ${batchType === "teachers" ? "Teacher" : "Student"}`
      : batchType === "teachers"
        ? "Register Teacher"
        : "Enroll Student";
  }

  const actionHeader = docId ? "" : "<th>Action</th>";

  header.innerHTML = batchType === "teachers"
    ? `<tr><th>Full Name</th><th>Account ID</th><th>Password</th>${actionHeader}</tr>`
    : `<tr><th>Full Name</th><th>Account ID</th><th>Section</th><th>Password</th>${actionHeader}</tr>`;

  if (addButton) {
    addButton.classList.toggle("hidden", Boolean(docId));
  }

  if (docId) {
    const record = getByDocId(batchType, docId);

    if (!record) {
      void showMessage(
        "Record not found. Please refresh the page.",
        "warning"
      );
      return;
    }

    addModalInputRow(
      record.name || "",
      record.id || "",
      record.sec || "",
      record.pass || ""
    );
  } else {
    addModalInputRow();
  }

  modal.classList.remove("hidden");
}

function addModalInputRow(name = "", id = "", sec = "", pass = "") {
  const tbody = document.getElementById("modalTableBody");
  if (!tbody) return;

  const tr = document.createElement("tr");
  tr.className = "input-row-layer";

  function createInput(className, value, placeholder, inputType = "text") {
    const input = document.createElement("input");

    input.type = inputType;
    input.className = `modal-table-input ${className}`;
    input.value = value;
    input.placeholder = placeholder;
    input.autocomplete = "off";

    return input;
  }

  function appendCell(element, className = "") {
    const td = document.createElement("td");

    if (className) td.className = className;

    td.appendChild(element);
    tr.appendChild(td);
  }

  appendCell(createInput("row-name", name, "Full Name"));
  appendCell(createInput("row-id", id, "Account ID"));

  if (batchType === "students") {
    const select = document.createElement("select");
    select.className = "modal-table-input row-sec";

    const sections = ["Grade 4 - A", "Grade 4 - B"];

    sections.forEach(section => {
      const option = document.createElement("option");
      option.value = section;
      option.textContent = section;
      select.appendChild(option);
    });

    if (sec && !sections.includes(sec)) {
      const option = document.createElement("option");
      option.value = sec;
      option.textContent = sec;
      select.appendChild(option);
    }

    if (sec) select.value = sec;

    appendCell(select);
  }

  appendCell(createInput("row-pass", pass, "Password", "password"));

  const actionCell = document.createElement("td");
  actionCell.className = "modal-action-cell";

  if (!editDocId) {
    const removeButton = document.createElement("button");

    removeButton.type = "button";
    removeButton.className = "row-del-btn";
    removeButton.title = "Remove row";
    removeButton.setAttribute("aria-label", "Remove row");

    const icon = document.createElement("i");
    icon.className = "fas fa-trash";

    removeButton.appendChild(icon);

    removeButton.addEventListener("click", () => {
      tr.remove();
    });

    actionCell.appendChild(removeButton);
  }

  tr.appendChild(actionCell);
  tbody.appendChild(tr);
}

async function saveBatchUsers() {
  const rows = [
    ...document.querySelectorAll("#modalTableBody tr")
  ];

  if (!rows.length) {
    void showMessage(
      "Please add at least one record.",
      "warning"
    );
    return;
  }

  const entries = rows.map(row => ({
    name: row.querySelector(".row-name")?.value.trim() || "",
    id: row.querySelector(".row-id")?.value.trim() || "",
    sec: row.querySelector(".row-sec")?.value || "",
    pass: row.querySelector(".row-pass")?.value || ""
  }));

  if (entries.some(entry =>
    !entry.name || !entry.id || !entry.pass
  )) {
    void showMessage(
      "Please complete the name, account ID, and password fields.",
      "warning"
    );
    return;
  }

  const normalizedBatchIds = entries.map(entry =>
    entry.id.trim().toLowerCase()
  );

  if (new Set(normalizedBatchIds).size !== normalizedBatchIds.length) {
    void showMessage(
      "The batch contains duplicate Account IDs. Please use unique Account IDs.",
      "warning"
    );
    return;
  }

  try {
    for (const entry of entries) {
      const duplicate = await isAccountIdTaken(
        entry.id,
        batchType,
        editDocId
      );

      if (duplicate) {
        void showMessage(
          `Account ID "${entry.id}" is already used. Please use a different Account ID.`,
          "warning"
        );
        return;
      }
    }

    if (editDocId) {
      const entry = entries[0];

      const updateFields = {
        name: entry.name,
        id: entry.id,
        pass: entry.pass,
        updatedAt: serverTimestamp()
      };

      if (batchType === "students") {
        updateFields.sec = entry.sec;
      }

      await updateDoc(
        doc(getCollection(batchType), editDocId),
        updateFields
      );

      await addLog(
        `${batchType === "teachers" ? "Teacher" : "Student"} updated successfully: ${entry.name}`
      );
    } else {
      for (const entry of entries) {
        const record = {
          name: entry.name,
          id: entry.id,
          pass: entry.pass,
          archived: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        if (batchType === "students") {
          record.sec = entry.sec;

          Object.assign(
            record,
            getStudentStartingAttributes()
          );
        }

        await addDoc(getCollection(batchType), record);

        await addLog(
          `${batchType === "teachers" ? "Teacher" : "Student"} added successfully: ${entry.name}`
        );
      }
    }

    if (!realtimeActive && !await loadAllData()) {
      void showMessage(
        "The data was saved, but the tables could not be refreshed.",
        "warning"
      );
      return;
    }

    const wasEditing = Boolean(editDocId);

    closeBatchModal();

    void showMessage(
      wasEditing
        ? "Record updated successfully."
        : "Record(s) saved successfully.",
      "success"
    );
  } catch (error) {
    console.error("Batch save error:", error);

    void showMessage(
      "Failed to save records to Firestore. Please try again.",
      "error"
    );
  }
}

function closeBatchModal() {
  document.getElementById("batchUserModal")?.classList.add("hidden");
  editDocId = null;
}

function togglePassword(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.type = input.type === "password" ? "text" : "password";
}

function updateUI() {
  renderTable("tTable", teachers, "teachers");
  renderTable("sTable", students, "students");

  renderTable("atTable", teachers, "teachers", true);
  renderTable("asTable", students, "students", true);

  renderSectionTable();

  const countT = document.getElementById("countT");
  const countS = document.getElementById("countS");

  if (countT) {
    countT.textContent = teachers.filter(item => !item.archived).length;
  }

  if (countS) {
    countS.textContent = students.filter(item => !item.archived).length;
  }
}

function showTab(tab) {
  const target = document.getElementById(`${tab}Panel`);

  if (!target) {
    console.error(`Panel not found: ${tab}Panel`);
    return;
  }

  document.querySelectorAll(".main-panel > div").forEach(panel => {
    panel.classList.add("hidden");
  });

  target.classList.remove("hidden");

  document.querySelectorAll(".nav-menu .nav-item[data-tab]").forEach(item => {
    item.classList.toggle("active", item.dataset.tab === tab);
  });

  if (tab === "logs") renderLogs();
  if (tab === "sections") renderSectionTable();

  console.log(`Opened page: ${tab}`);
}

function setupNavigation() {
  document.querySelectorAll(".nav-menu .nav-item[data-tab]").forEach(item => {
    item.addEventListener("click", () => {
      showTab(item.dataset.tab);
    });
  });
}

async function login() {
  if (isLoggingIn) return;

  const passwordInput = document.getElementById("adminPass");
  const password = passwordInput?.value || "";

  if (!password) {
    void showMessage(
      "Please enter the admin password.",
      "warning"
    );
    passwordInput?.focus();
    return;
  }

  if (password !== "brain2025") {
    void showMessage(
      "Incorrect password. Please try again.",
      "error"
    );
    passwordInput?.focus();
    return;
  }

  isLoggingIn = true;

  const button = document.querySelector(
    '#loginPanel button[onclick="login()"]'
  );

  if (button) {
    button.disabled = true;
    button.textContent = "Loading...";
  }

  try {
    startRealtimeListeners();

    document.getElementById("loginPanel")?.classList.add("hidden");
    document.getElementById("dashboardPanel")?.classList.remove("hidden");
    document.getElementById("sidebar")?.classList.add("sidebar-unlocked");

    updateUI();

    if (passwordInput) passwordInput.value = "";

    void addLog("SYSTEM: Admin logged in successfully.");

    console.log("Admin portal opened successfully.");
  } catch (error) {
    console.error("Login error:", error);

    stopRealtimeListeners();

    void showMessage(
      "Unable to open the admin portal. Please try again.",
      "error"
    );
  } finally {
    isLoggingIn = false;

    if (button) {
      button.disabled = false;
      button.textContent = "Enter Portal";
    }
  }
}

async function handleLogout() {
  const confirmed = await showConfirm(
    "Are you sure you want to log out?",
    "Confirm Logout"
  );

  if (!confirmed) return;

  stopRealtimeListeners();

  showTab("login");

  document.getElementById("dashboardPanel")?.classList.add("hidden");
  document.getElementById("sidebar")?.classList.remove("sidebar-unlocked");

  void addLog("SYSTEM: Admin logged out successfully.");

  document.querySelectorAll(".nav-menu .nav-item[data-tab]").forEach(item => {
    item.classList.remove("active");
  });

  const passwordInput = document.getElementById("adminPass");
  if (passwordInput) passwordInput.value = "";

  teachers = [];
  students = [];
  logs = [];

  updateUI();
  renderLogs();
}

function updateClock() {
  const clock = document.getElementById("liveTime");

  if (clock) {
    clock.textContent = new Date().toLocaleTimeString("en-US");
  }
}

function initializePortal() {
  createPopupSystem();
  setupNavigation();

  document.getElementById("sectionFilter")
    ?.addEventListener("change", renderSectionTable);

  updateClock();
  setInterval(updateClock, 1000);

  showTab("login");

  console.log("PhenomaPals initialized.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePortal);
} else {
  initializePortal();
}

Object.assign(window, {
  login,
  handleLogout,
  togglePassword,
  toggleSelectAll,
  bulkToggleArchive,
  renderSectionTable,
  exportToExcel,
  openBatchModal,
  addModalInputRow,
  saveBatchUsers,
  closeBatchModal,
  clearLogs,
  addTeacher,
  addStudent,
  editTeacher,
  editStudent,
  setArchived,
  loadAllData,
  showTab
});
