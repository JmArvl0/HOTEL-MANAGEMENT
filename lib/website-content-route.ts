import { NextResponse } from "next/server";

export function websiteContentFailure(error: { message: string }) {
  const messages: Record<string, [number, string]> = {
    ADMIN_AUTHORITY_REQUIRED: [403, "Owner or System Admin authority is required."],
    WEBSITE_STALE: [409, "Another editor saved a newer version. Reload the latest content before saving."],
    WEBSITE_INVALID: [400, "Check the website content fields and try again."],
    WEBSITE_REASON_REQUIRED: [400, "Enter a reason for publishing."],
    WEBSITE_CLIENT_REVIEW_REQUIRED: [400, "Review the property information and legal notices before publishing client mode."],
    WEBSITE_VERIFICATION_REQUIRED: [400, "Publish a verified, non-demo hotel location in Location & Places first."],
    WEBSITE_REAL_PHOTOS_REQUIRED: [400, "Client mode needs uploaded property photos for the hero and property gallery."],
    WEBSITE_IMAGE_UNAVAILABLE: [409, "That image is unavailable or being removed. Select another photo."],
    WEBSITE_IMAGE_IN_USE: [409, "This image is used in the draft or published page. Replace those references before deleting it."],
  };
  const match = Object.entries(messages).find(([key]) => error.message.includes(key));
  const [status, message] = match ? match[1] : [503, "Website content is temporarily unavailable. Try again."];
  return NextResponse.json({ error: message }, { status: Number(status), headers: { "Cache-Control": "no-store" } });
}
