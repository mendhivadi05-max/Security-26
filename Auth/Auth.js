const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const submitButton = document.getElementById("submit-button");
const error = document.getElementById("error");
const turnstileContainer = document.getElementById("turnstile-widget");

let turnstileWidgetId = null;
let turnstileToken = "";
let turnstileEnabled = true;

function showError(message, success = false) {
    error.style.color = success ? "green" : "red";
    error.textContent = message;
}

function usernameToEmail(value) {
    const username = value.trim().toLowerCase();
    return username.includes("@") ? username : `${username}@clubdesk.local`;
}

async function api(path, data = {}) {
    const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || "Request failed.");
    }
    return result;
}

async function renderTurnstile() {
    try {
        const response = await fetch("/api/auth-config", { cache: "no-store" });
        const config = await response.json();
        if (!response.ok) {
            throw new Error("Turnstile is not configured.");
        }

        turnstileEnabled = config.turnstileEnabled !== false;
        if (!turnstileEnabled) {
            turnstileContainer.textContent = "Not required on localhost";
            return;
        }

        if (!config.turnstileSiteKey) {
            throw new Error("Turnstile is not configured.");
        }

        turnstileWidgetId = window.turnstile.render(turnstileContainer, {
            sitekey: config.turnstileSiteKey,
            theme: "light",
            callback(token) {
                turnstileToken = token;
                showError("");
            },
            "expired-callback"() {
                turnstileToken = "";
                showError("The human check expired. Please complete it again.");
            },
            "error-callback"() {
                turnstileToken = "";
                showError("The human check could not load.");
            }
        });
    }
    catch (configError) {
        showError(configError.message);
    }
}

async function login() {
    const email = usernameToEmail(usernameInput.value);
    const password = passwordInput.value;

    if (
        !usernameInput.value.trim() ||
        !password ||
        (turnstileEnabled && !turnstileToken)
    ) {
        showError(
            turnstileEnabled
                ? "Complete the username, password, and human check."
                : "Complete the username and password."
        );
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "CHECKING...";
    showError("");

    try {
        const result = await api("/api/login", {
            email,
            password,
            turnstileToken
        });

        passwordInput.value = "";
        sessionStorage.setItem("currentUserId", result.username);
        showError("Access Granted!", true);
        window.location.replace("../Home/Home.html");
    }
    catch (loginError) {
        passwordInput.value = "";
        turnstileToken = "";
        if (turnstileEnabled && turnstileWidgetId !== null) {
            window.turnstile.reset(turnstileWidgetId);
        }
        showError(loginError.message || "Login failed. Please try again.");
    }
    finally {
        submitButton.disabled = false;
        submitButton.textContent = "SUBMIT";
    }
}

submitButton.addEventListener("click", login);
document.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        login();
    }
});

window.onloadTurnstileCallback = renderTurnstile;
