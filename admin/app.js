const CMS_API_BASE = "https://tesarstvi-hervert-cms.sjeror11.workers.dev";
const STATIC_CONTENT_URL = "../data/site-content.json";
const SESSION_TOKEN_KEY = "th_admin_token";

const state = {
    services: [],
    selectedService: "",
    photosByService: {},
    user: null
};

const elements = {
    loginView: document.getElementById("login-view"),
    adminView: document.getElementById("admin-view"),
    loginForm: document.getElementById("login-form"),
    loginStatus: document.getElementById("login-status"),
    adminStatus: document.getElementById("admin-status"),
    adminUser: document.getElementById("admin-user"),
    serviceSelect: document.getElementById("service-select"),
    uploadForm: document.getElementById("upload-form"),
    galleryGrid: document.getElementById("gallery-grid"),
    galleryTitle: document.getElementById("gallery-title"),
    galleryCount: document.getElementById("gallery-count"),
    refreshButton: document.getElementById("refresh-button"),
    logoutButton: document.getElementById("logout-button")
};

boot();

async function boot() {
    try {
        await loadServices();
        bindEvents();
        await restoreSession();
    } catch (error) {
        showLoginError("Administrace se nepodařila načíst.");
        console.error(error);
    }
}

function bindEvents() {
    elements.loginForm.addEventListener("submit", handleLogin);
    elements.serviceSelect.addEventListener("change", handleServiceChange);
    elements.uploadForm.addEventListener("submit", handleUpload);
    elements.refreshButton.addEventListener("click", refreshPhotos);
    elements.logoutButton.addEventListener("click", handleLogout);
}

async function loadServices() {
    const response = await fetch(STATIC_CONTENT_URL, { cache: "no-store" });
    const content = await response.json();
    state.services = (content.services || []).map(function (service) {
        return {
            slug: service.slug,
            title: service.title
        };
    });

    state.selectedService = state.services[0] ? state.services[0].slug : "";

    elements.serviceSelect.innerHTML = state.services
        .map(function (service) {
            return '<option value="' + escapeHtml(service.slug) + '">' + escapeHtml(service.title) + "</option>";
        })
        .join("");
}

async function restoreSession() {
    try {
        const me = await apiRequest("/api/me");
        state.user = me.user;
        showAdmin();
        await refreshPhotos();
    } catch {
        showLogin();
    }
}

async function handleLogin(event) {
    event.preventDefault();
    hideStatus(elements.loginStatus);

    const formData = new FormData(elements.loginForm);
    const payload = {
        username: String(formData.get("username") || "").trim(),
        password: String(formData.get("password") || "")
    };

    try {
        const response = await apiRequest("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        state.user = response.user;
        storeToken(response.token);
        elements.loginForm.reset();
        showAdmin();
        await refreshPhotos();
    } catch (error) {
        showLoginError(error.message || "Přihlášení selhalo.");
    }
}

async function handleLogout() {
    try {
        await apiRequest("/api/logout", { method: "POST" });
    } catch (error) {
        console.error(error);
    }

    state.user = null;
    state.photosByService = {};
    clearToken();
    showLogin();
}

function handleServiceChange(event) {
    state.selectedService = event.target.value;
    renderGallery();
}

async function refreshPhotos() {
    hideStatus(elements.adminStatus);

    try {
        const response = await apiRequest("/api/admin/photos");
        state.photosByService = response.photosByService || {};
        renderGallery();
        showAdminStatus("Galerie byla načtena.", "success");
    } catch (error) {
        showAdminStatus(error.message || "Nepodařilo se načíst galerie.", "error");
    }
}

async function handleUpload(event) {
    event.preventDefault();
    hideStatus(elements.adminStatus);

    if (!state.selectedService) {
        showAdminStatus("Nejdřív vyber sekci webu.", "error");
        return;
    }

    const formData = new FormData(elements.uploadForm);
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
        showAdminStatus("Vyber obrázek k nahrání.", "error");
        return;
    }

    const payload = new FormData();
    payload.set("service", state.selectedService);
    payload.set("alt", String(formData.get("alt") || "").trim());
    payload.set("file", file);

    try {
        await apiRequest("/api/admin/photos/upload", {
            method: "POST",
            body: payload
        });

        elements.uploadForm.reset();
        await refreshPhotos();
        showAdminStatus("Fotka byla přidána.", "success");
    } catch (error) {
        showAdminStatus(error.message || "Upload se nepodařil.", "error");
    }
}

async function handleDelete(photoId) {
    if (!window.confirm("Opravdu chceš tuto fotku smazat?")) {
        return;
    }

    try {
        await apiRequest("/api/admin/photos/" + encodeURIComponent(photoId), {
            method: "DELETE"
        });

        await refreshPhotos();
        showAdminStatus("Fotka byla smazána.", "success");
    } catch (error) {
        showAdminStatus(error.message || "Mazání se nepodařilo.", "error");
    }
}

function showLogin() {
    elements.loginView.classList.remove("hidden");
    elements.adminView.classList.add("hidden");
    hideStatus(elements.adminStatus);
}

function showAdmin() {
    elements.loginView.classList.add("hidden");
    elements.adminView.classList.remove("hidden");
    elements.adminUser.textContent = state.user ? "Přihlášený uživatel: " + state.user.username : "";
}

function renderGallery() {
    const service = state.services.find(function (item) {
        return item.slug === state.selectedService;
    });

    const photos = state.photosByService[state.selectedService] || [];
    elements.galleryTitle.textContent = service ? service.title : "Bez sekce";
    elements.galleryCount.textContent = photos.length + " fotek";

    if (photos.length === 0) {
        elements.galleryGrid.innerHTML = '<div class="empty">Tato sekce zatím nemá žádné nahrané fotky.</div>';
        return;
    }

    elements.galleryGrid.innerHTML = photos
        .map(function (photo) {
            return (
                '<article class="photo-card">' +
                '<img src="' + escapeAttribute(photo.url) + '" alt="' + escapeAttribute(photo.alt || "") + '">' +
                '<div class="photo-card-body">' +
                "<strong>" + escapeHtml(photo.alt || "Bez popisku") + "</strong>" +
                "<small>" + escapeHtml(photo.filename || photo.url) + "</small>" +
                '<button class="danger" type="button" data-photo-id="' + escapeAttribute(photo.id) + '">Smazat</button>' +
                "</div>" +
                "</article>"
            );
        })
        .join("");

    Array.from(elements.galleryGrid.querySelectorAll("[data-photo-id]")).forEach(function (button) {
        button.addEventListener("click", function () {
            handleDelete(button.getAttribute("data-photo-id"));
        });
    });
}

async function apiRequest(path, options = {}) {
    const token = readToken();
    const headers = new Headers(options.headers || {});

    if (token) {
        headers.set("Authorization", "Bearer " + token);
    }

    const response = await fetch(CMS_API_BASE + path, {
        ...options,
        headers,
        credentials: "include"
    });

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await response.json() : null;

    if (!response.ok) {
        throw new Error(payload && payload.error ? payload.error : "Požadavek se nepodařil.");
    }

    return payload;
}

function showLoginError(message) {
    showStatus(elements.loginStatus, message, "error");
}

function showAdminStatus(message, type) {
    showStatus(elements.adminStatus, message, type);
}

function showStatus(element, message, type) {
    element.textContent = message;
    element.className = "status " + type;
    element.classList.remove("hidden");
}

function hideStatus(element) {
    element.classList.add("hidden");
    element.textContent = "";
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
    return escapeHtml(value);
}

function storeToken(token) {
    if (!token) {
        return;
    }

    window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
}

function readToken() {
    return window.sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
}

function clearToken() {
    window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
}
