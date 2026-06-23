async function guardPage() {
    try {
        const response = await fetch("/api/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            cache: "no-store"
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error);
        }

        sessionStorage.setItem("currentUserId", result.username);
        document.body.style.visibility = "visible";
    }
    catch {
        sessionStorage.removeItem("currentUserId");
        window.location.replace("../Auth/Auth.html");
    }
}

guardPage();
