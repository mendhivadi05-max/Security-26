const modal =
    document.getElementById("databaseChoiceModal");

const openButton =
    document.getElementById("openChoices");

const closeButton =
    document.getElementById("closeChoices");

function openChoices() {
    modal.classList.add("is-visible");
}

function closeChoices() {
    modal.classList.remove("is-visible");
}

openButton.addEventListener("click", openChoices);
closeButton.addEventListener("click", closeChoices);

modal.addEventListener("click", (event) => {
    if (event.target === modal) {
        closeChoices();
    }
});
