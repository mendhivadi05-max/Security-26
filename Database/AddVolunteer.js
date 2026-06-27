import { showSuccess, showErrorToast } from "../Shared/Toast.js";
import { apiPost, loadCollections } from "../Shared/Api.js";

const form =
    document.getElementById("volunteerForm");

const branchSelect =
    document.getElementById("volunteerCourse");

const customBranchLabel =
    document.getElementById("customBranchLabel");

const customBranchInput =
    document.getElementById("customBranch");

const imageInput =
    document.getElementById("volunteerImage");

const imagePreview =
    document.getElementById("imagePreview");

let selectedImage = "";
let knownBranches = [];

const DEFAULT_BRANCHES = ["B-Tech", "B-com", "BSc"];
const OTHER_BRANCH_VALUE = "__other";

function branchNameFromMember(member) {
    return (member.branch || member.course || member.profile?.branch || member.profile?.course || "")
        .toString()
        .trim();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function setBranchOptions(branches = []) {
    const selected = branchSelect.value;
    knownBranches = [...new Set([...knownBranches, ...branches].filter(Boolean))];
    const customBranches = knownBranches
        .filter(branch => !DEFAULT_BRANCHES.includes(branch))
        .sort((a, b) => a.localeCompare(b));
    const options = [...DEFAULT_BRANCHES, ...customBranches];

    branchSelect.innerHTML = [
        '<option value="">Select branch</option>',
        ...options.map(branch => `<option>${escapeHtml(branch)}</option>`),
        `<option value="${OTHER_BRANCH_VALUE}">Other</option>`
    ].join("");

    if (selected && options.includes(selected)) {
        branchSelect.value = selected;
    }
}

function selectedBranch() {
    return branchSelect.value === OTHER_BRANCH_VALUE
        ? customBranchInput.value.trim()
        : branchSelect.value;
}

function updateCustomBranchVisibility() {
    const isOther = branchSelect.value === OTHER_BRANCH_VALUE;
    customBranchLabel.hidden = !isOther;
    customBranchInput.required = isOther;
    if (!isOther) {
        customBranchInput.value = "";
    }
}

async function loadBranchOptions() {
    try {
        const data = await loadCollections(["members"]);
        setBranchOptions((data.members || []).map(branchNameFromMember));
    }
    catch (error) {
        console.error("Branch option load error:", error);
        setBranchOptions();
    }
}

function readImage(file) {
    return new Promise((resolve, reject) => {
        const reader =
            new FileReader();

        reader.onload =
            () => resolve(reader.result);

        reader.onerror =
            () => reject(reader.error);

        reader.readAsDataURL(file);
    });
}

imageInput.addEventListener("change", async () => {
    const file =
        imageInput.files[0];

    selectedImage = "";

    if (!file) {
        imagePreview.textContent = "No image selected";
        imagePreview.style.backgroundImage = "";
        return;
    }

    if (file.size > 650 * 1024) {
        imageInput.value = "";
        imagePreview.textContent = "Image must be smaller than 650 KB";
        showErrorToast("Please choose an image smaller than 650 KB.");
        return;
    }

    try {
        selectedImage =
            await readImage(file);

        imagePreview.textContent = "";
        imagePreview.style.backgroundImage =
            `url("${selectedImage}")`;
    }
    catch (error) {
        console.error("Image read error:", error);
        showErrorToast("Could not load that image.");
    }
});

form.addEventListener("reset", () => {
    selectedImage = "";
    imagePreview.textContent = "No image selected";
    imagePreview.style.backgroundImage = "";
    setTimeout(updateCustomBranchVisibility, 0);
});

branchSelect.addEventListener("change", updateCustomBranchVisibility);

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name =
        document.getElementById("volunteerName").value.trim();

    const dateOfBirth =
        document.getElementById("volunteerDob").value;

    const gender =
        document.getElementById("volunteerGender").value;

    const branch =
        selectedBranch();

    const batch =
        document.getElementById("volunteerBatch").value;

    const whatsappNumber =
        document.getElementById("volunteerWhatsapp").value.trim();

    if (!name || !dateOfBirth || !branch || !gender || !batch || !whatsappNumber) {
        showErrorToast("Please fill all required volunteer details.");
        return;
    }

    try {
        const result = await apiPost("/api/data", {
            action: "createMember",
            member: {
                name,
                dateOfBirth,
                gender,
                course: branch,
                branch,
                batch,
                whatsappNumber,
                image: selectedImage
            }
        });

        showSuccess("Volunteer added successfully.");
        console.info("Volunteer created:", result.id);
        setBranchOptions([branch]);
        form.reset();
    }
    catch (error) {
        console.error("Save volunteer error:", error);
        showErrorToast("Error saving volunteer.");
    }
});

loadBranchOptions();
updateCustomBranchVisibility();
