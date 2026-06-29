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

const duplicateWarning =
    document.getElementById("duplicateWarning");

let selectedImage = "";
let knownBranches = [];
let existingMembers = [];

const DEFAULT_BRANCHES = ["B-Tech", "B-com", "BSc"];
const OTHER_BRANCH_VALUE = "__other";

function branchNameFromMember(member) {
    return (member.branch || member.course || member.profile?.branch || member.profile?.course || "")
        .toString()
        .trim();
}

function normalizeName(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^\da-z\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizePhone(value) {
    const digits =
        String(value || "").replace(/[^\d]/g, "");

    return digits.length > 10
        ? digits.slice(-10)
        : digits;
}

function memberPhone(member) {
    return member.contact?.whatsappNumber || member.whatsappNumber || member.phone || "";
}

function findPotentialDuplicates(name, whatsappNumber) {
    const normalizedName =
        normalizeName(name);

    const normalizedPhone =
        normalizePhone(whatsappNumber);

    if (!normalizedName && !normalizedPhone) {
        return [];
    }

    return existingMembers
        .map(member => {
            const candidateName =
                normalizeName(member.name || member.profile?.name);

            const candidatePhone =
                normalizePhone(memberPhone(member));

            const samePhone =
                normalizedPhone && candidatePhone && normalizedPhone === candidatePhone;

            const sameName =
                normalizedName && candidateName && normalizedName === candidateName;

            const similarName =
                normalizedName.length >= 5 &&
                candidateName.length >= 5 &&
                (candidateName.includes(normalizedName) || normalizedName.includes(candidateName));

            return {
                member,
                reason: samePhone
                    ? "same WhatsApp number"
                    : sameName
                        ? "same name"
                        : similarName
                            ? "similar name"
                            : ""
            };
        })
        .filter(match => match.reason)
        .slice(0, 3);
}

function renderDuplicateWarning() {
    const name =
        document.getElementById("volunteerName").value.trim();

    const whatsappNumber =
        document.getElementById("volunteerWhatsapp").value.trim();

    const matches =
        findPotentialDuplicates(name, whatsappNumber);

    if (!matches.length) {
        duplicateWarning.hidden = true;
        duplicateWarning.innerHTML = "";
        return;
    }

    duplicateWarning.hidden = false;
    duplicateWarning.innerHTML = `
        <strong>Possible duplicate volunteer</strong>
        <span>Check before saving:</span>
        <ul>
            ${matches.map(({ member, reason }) => `
                <li>
                    ${escapeHtml(member.name || member.profile?.name || "Unnamed")}
                    <small>${escapeHtml(reason)}${memberPhone(member) ? ` - ${escapeHtml(memberPhone(member))}` : ""}</small>
                </li>
            `).join("")}
        </ul>
    `;
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
        existingMembers = data.members || [];
        setBranchOptions(existingMembers.map(branchNameFromMember));
        renderDuplicateWarning();
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

["volunteerName", "volunteerWhatsapp"].forEach(id => {
    document.getElementById(id).addEventListener("input", renderDuplicateWarning);
});

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

    const whatsappNumber =
        document.getElementById("volunteerWhatsapp").value.trim();

    if (!name || !dateOfBirth || !branch || !gender || !whatsappNumber) {
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
