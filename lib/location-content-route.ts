import { NextResponse } from "next/server";
export function locationFailure(error: { message: string; code?: string }) {
  const messages: Record<string, [number, string]> = {
    WEBSITE_FORBIDDEN: [403, "Owner or System Administrator authority is required."],
    WEBSITE_STALE: [409, "This content changed in another session. Refresh and reopen it before saving."],
    WEBSITE_NOT_FOUND: [404, "This item no longer exists. Refresh the editor."],
    WEBSITE_CATEGORY_IN_USE: [409, "Reassign all places in this category before deleting it."],
    WEBSITE_CATEGORY_REQUIRED: [400, "Choose a published category before publishing this place."],
    WEBSITE_LOCATION_CHANGED: [409, "The hotel location changed. Review the place or route against the current location before publishing."],
    WEBSITE_VERIFICATION_REQUIRED: [400, "Add verified coordinates, verification date/source, and real photos before publishing client content. Sample searches/photos require demo mode."],
    WEBSITE_IMAGE_IN_USE: [409, "This image is still attached to a place or route. Remove those references first."],
    WEBSITE_IMAGE_UNAVAILABLE: [409, "That image is unavailable or being deleted. Upload or select another image."],
    WEBSITE_INVALID: [400, "Check the content fields and try again."],
  };
  const key = Object.keys(messages).find(value => error.message.includes(value));
  const [status, message] = key ? messages[key] : error.code === "23505" ? [409, "This slug is already used. Choose a different category slug."] : error.code === "23514" || error.code === "23502" || error.code === "22P02" || error.code === "23503" ? [400, "Check the field values, image and category references."] : [503, "Location content is unavailable. Check the database migration and try again."];
  return NextResponse.json({ error: message }, { status: Number(status), headers: { "Cache-Control": "no-store" } });
}
