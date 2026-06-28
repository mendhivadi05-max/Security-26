const savedUserId = sessionStorage.getItem("currentUserId");

if(savedUserId){
    document.getElementById("userNameDisplay").innerText =
        "User: " + savedUserId;
}

let allTasks =
    JSON.parse(localStorage.getItem("dashboardTasks")) || {};

let taskCategories =
    JSON.parse(localStorage.getItem("dashboardCategories")) || [
        {
            name:"Work",
            color:"#3498db"
        }
    ];

let currentSelectedDate = "";
let volunteerBirthdays = {};

const actualToday = new Date();

async function logout(){
    try {
        await fetch("/api/logout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}"
        });
    }
    catch {
        // Clear the visible browser state even if the server is already offline.
    }
    sessionStorage.clear();
    window.location.href = "../Auth/Auth";
}

function openModal(id){
    document.getElementById(id).style.display = "flex";
}

function closeModal(id){
    document.getElementById(id).style.display = "none";
}

function initializeCategories(){

    const legend =
        document.getElementById("legendItems");

    const select =
        document.getElementById("newTaskColor");

    legend.innerHTML = "";
    select.innerHTML = "";

    taskCategories.forEach((cat,index)=>{

        legend.innerHTML += `
            <div class="legend-item">
                <div
                    class="legend-swatch"
                    style="background:${safeColor(cat.color)}">
                </div>
                ${escapeHomeHtml(cat.name)}
                <button
                    class="remove-cat-btn"
                    onclick="deleteCat(${index})">
                    &times;
                </button>
            </div>
        `;

        select.innerHTML += `
            <option value="${safeColor(cat.color)}">
                ${escapeHomeHtml(cat.name)}
            </option>
        `;
    });

    legend.innerHTML += `
        <div class="legend-item birthday-legend">
            <div class="legend-swatch birthday-dot"></div>
            Birthdays
        </div>
    `;
}

function deleteCat(index){

    taskCategories.splice(index,1);

    localStorage.setItem(
        "dashboardCategories",
        JSON.stringify(taskCategories)
    );

    initializeCategories();
    renderCalendar();
}

function saveNewCategory(){

    const name =
        document.getElementById("newCategoryName").value;

    const color =
        document.getElementById("newCategoryColor").value;

    if(name){

        taskCategories.push({
            name,
            color
        });

        localStorage.setItem(
            "dashboardCategories",
            JSON.stringify(taskCategories)
        );

        initializeCategories();
        closeModal("categoryModal");
    }
}

let currentDate = new Date();

function renderCalendar(){

    const grid =
        document.getElementById("calendar-days");

    grid.innerHTML = "";

    const month = currentDate.getMonth();
    const year = currentDate.getFullYear();

    document.getElementById("month-year").innerText =
        new Date(year,month).toLocaleString(
            "default",
            {
                month:"long",
                year:"numeric"
            }
        );

    const firstDay =
        new Date(year,month,1).getDay();

    const days =
        new Date(year,month+1,0).getDate();

    for(let i=0;i<firstDay;i++){
        grid.innerHTML += "<div></div>";
    }

    for(let i=1;i<=days;i++){

        const dateStr =
            `${year}-${month+1}-${i}`;

        const isToday =
            (
                i === actualToday.getDate() &&
                month === actualToday.getMonth() &&
                year === actualToday.getFullYear()
            )
            ? "today"
            : "";

        const tasks =
            allTasks[dateStr] || [];

        const birthdayKey =
            `${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;

        const birthdays =
            volunteerBirthdays[birthdayKey] || [];

        let dots =
            '<div class="task-dots">';

        tasks.forEach(task=>{
            dots += `
                <div
                    class="task-dot"
                    style="background:${safeColor(task.color)}">
                </div>
            `;
        });

        birthdays.forEach(() => {
            dots += '<div class="task-dot birthday-dot"></div>';
        });

        dots += "</div>";

        grid.innerHTML += `
            <div
                class="calendar-day ${isToday}"
                onclick="openTaskModal('${dateStr}')">

                ${i}

                ${dots}

            </div>
        `;
    }
}

function changeMonth(direction){
    currentDate.setMonth(
        currentDate.getMonth() + direction
    );

    renderCalendar();
}

function openTaskModal(dateStr){

    currentSelectedDate = dateStr;

    renderTaskList();

    openModal("taskModal");
}

function renderTaskList(){

    const list =
        document.getElementById("taskList");

    list.innerHTML = "";

    const selectedDate =
        currentSelectedDate.split("-");

    const birthdayKey =
        `${String(selectedDate[1] || "").padStart(2, "0")}-${String(selectedDate[2] || "").padStart(2, "0")}`;

    (volunteerBirthdays[birthdayKey] || [])
        .forEach(person => {
            list.innerHTML += `
                <li class="task-item birthday-item">
                    <span>
                        <strong>${escapeHomeHtml(person.name)}'s birthday</strong>
                        <small>${escapeHomeHtml(person.branch || person.course)}</small>
                    </span>
                </li>
            `;
        });

    (allTasks[currentSelectedDate] || [])
        .forEach((task,index)=>{

        list.innerHTML += `
            <li
                class="task-item"
                style="border-left-color:${safeColor(task.color)}">

                ${escapeHomeHtml(task.text)}

                <button
                    onclick="deleteTask(${index})">
                    X
                </button>

            </li>
        `;
    });
}

function escapeHomeHtml(value){
    return (value || "")
        .toString()
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function safeColor(value){
    const color = (value || "").toString().trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : "#3498db";
}

function addNewTask(){

    const text =
        document.getElementById("newTaskInput").value;

    const color =
        document.getElementById("newTaskColor").value;

    if(text.trim() === ""){
        return;
    }

    if(!allTasks[currentSelectedDate]){
        allTasks[currentSelectedDate] = [];
    }

    allTasks[currentSelectedDate].push({
        text,
        color
    });

    localStorage.setItem(
        "dashboardTasks",
        JSON.stringify(allTasks)
    );

    document.getElementById("newTaskInput").value = "";

    renderTaskList();
    renderCalendar();
}

function deleteTask(index){

    allTasks[currentSelectedDate]
        .splice(index,1);

    localStorage.setItem(
        "dashboardTasks",
        JSON.stringify(allTasks)
    );

    renderTaskList();
    renderCalendar();
}

initializeCategories();
renderCalendar();

window.addEventListener("volunteer-birthdays-loaded", event => {
    volunteerBirthdays = event.detail || {};
    renderCalendar();
});

const databaseRecordsTile =
    document.getElementById("databaseRecordsTile");

const closeDatabaseRecords =
    document.getElementById("closeDatabaseRecords");

const dashboardInsightSearch =
    document.getElementById("dashboardInsightSearch");

const whatsappTile =
    document.getElementById("whatsappTile");

const closeWhatsappModal =
    document.getElementById("closeWhatsappModal");

databaseRecordsTile.addEventListener("click", event => {
    event.preventDefault();
    openModal("databaseRecordsModal");
});

closeDatabaseRecords.addEventListener("click", () => {
    closeModal("databaseRecordsModal");
});

dashboardInsightSearch.addEventListener("submit", event => {
    event.preventDefault();

    const query =
        document.getElementById("dashboardInsightInput").value.trim();

    window.location.href =
        query
            ? `../Database/BrowseStatistics?q=${encodeURIComponent(query)}`
            : "../Database/BrowseStatistics";
});

whatsappTile.addEventListener("click", event => {
    event.preventDefault();
    openModal("whatsappModal");
});

closeWhatsappModal.addEventListener("click", () => {
    closeModal("whatsappModal");
});
