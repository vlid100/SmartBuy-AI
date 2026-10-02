import webpush from "web-push";
const keys = webpush.generateVAPIDKeys();
console.log("WEB_PUSH_PUBLIC_KEY=" + keys.publicKey);
console.log("WEB_PUSH_PRIVATE_KEY=" + keys.privateKey);
console.log("WEB_PUSH_SUBJECT=mailto:you@example.com");
console.log("\nAdd these three values to Vercel → Project → Settings → Environment Variables.");
