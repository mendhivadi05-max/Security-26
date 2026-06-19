function login() {

    const username =
        document.getElementById("username").value.trim();

    const password =
        document.getElementById("password").value;

    const error =
        document.getElementById("error");

    const correctUsername = "admin";
    const correctPassword = "clubdesk";

    if (
        username === correctUsername &&
        password === correctPassword
    ) {

        sessionStorage.setItem(
            "isLoggedIn",
            "true"
        );

        sessionStorage.setItem(
            "currentUserId",
            username
        );

        error.style.color = "green";
        error.textContent = "Access Granted!";

        setTimeout(() => {

            window.location.href =
                "../Home/Home.html";

        }, 800);

    } else {

        error.style.color = "red";

        error.textContent =
            "Incorrect username or password.";
    }
}

document.addEventListener(
    "keydown",
    function(event) {

        if (event.key === "Enter") {
            login();
        }

    }
);
