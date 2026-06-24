function ensureToastRoot() {
    let root = document.getElementById("toastRoot");
    if (!root) {
        root = document.createElement("div");
        root.id = "toastRoot";
        root.className = "toast-root";
        document.body.appendChild(root);
    }
    return root;
}

function showToast(message, type = "success") {
    const root = ensureToastRoot();
    const toast = document.createElement("div");
    toast.className = `app-toast ${type === "error" ? "is-error" : "is-success"}`;
    toast.setAttribute("role", "status");
    toast.textContent = message;
    root.appendChild(toast);

    window.setTimeout(() => {
        toast.classList.add("is-leaving");
        window.setTimeout(() => toast.remove(), 180);
    }, 3600);
}

export function showSuccess(message) {
    showToast(message, "success");
}

export function showErrorToast(message) {
    showToast(message, "error");
}
