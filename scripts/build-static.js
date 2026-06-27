const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const output = path.join(root, "dist");

const entries = [
    "Admin",
    "Auth",
    "Attendance",
    "Database",
    "Flags",
    "Home",
    "Legal",
    "MeetingRecords",
    "Shared",
    "index.html"
];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const entry of entries) {
    const source = path.join(root, entry);
    const target = path.join(output, entry);

    if (!fs.existsSync(source)) {
        continue;
    }

    fs.cpSync(source, target, {
        recursive: true,
        filter: sourcePath => {
            const basename = path.basename(sourcePath);
            return !basename.startsWith(".") && !sourcePath.includes(`${path.sep}node_modules${path.sep}`);
        }
    });
}

console.log(`Built static frontend into ${path.relative(root, output)}`);
