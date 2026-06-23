import { db } from "../Firebase/Firebase.js";

import {
    collection,
    addDoc
}
from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const form =
    document.getElementById("volunteerForm");

const imageInput =
    document.getElementById("volunteerImage");

const imagePreview =
    document.getElementById("imagePreview");

let selectedImage = "";

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
        alert("Please choose an image smaller than 650 KB.");
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
        alert("Could not load that image.");
    }
});

form.addEventListener("reset", () => {
    selectedImage = "";
    imagePreview.textContent = "No image selected";
    imagePreview.style.backgroundImage = "";
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name =
        document.getElementById("volunteerName").value.trim();

    const dateOfBirth =
        document.getElementById("volunteerDob").value;

    const gender =
        document.getElementById("volunteerGender").value;

    const course =
        document.getElementById("volunteerCourse").value.trim();

    const batch =
        document.getElementById("volunteerBatch").value.trim();

    const whatsappNumber =
        document.getElementById("volunteerWhatsapp").value.trim();

    if (!name || !dateOfBirth || !gender || !course || !batch || !whatsappNumber) {
        alert("Please fill all required volunteer details.");
        return;
    }

    try {
        const createdAt = Date.now();

        await addDoc(
            collection(db, "members"),
            {
                name,
                dateOfBirth,
                gender,
                course,
                batch,
                whatsappNumber,
                image: selectedImage,
                createdAt,
                profile: {
                    name,
                    dateOfBirth,
                    gender,
                    course,
                    batch,
                    image: selectedImage
                },
                contact: {
                    whatsappNumber
                },
                metadata: {
                    createdAt,
                    updatedAt: createdAt,
                    schemaVersion: 2
                }
            }
        );

        alert("Volunteer added successfully.");
        form.reset();
    }
    catch (error) {
        console.error("Save volunteer error:", error);
        alert("Error saving volunteer.");
    }
});
