const modal =
    document.getElementById("databaseChoiceModal");

const openButton =
    document.getElementById("openChoices");

const closeButton =
    document.getElementById("closeChoices");

const insightSearchForm =
    document.getElementById("insightSearchForm");

const insightSearch =
    document.getElementById("insightSearch");

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

insightSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const query =
        insightSearch.value.trim();

    const target =
        query
            ? `BrowseStatistics.html?q=${encodeURIComponent(query)}`
            : "BrowseStatistics.html";

    window.location.href = target;
});