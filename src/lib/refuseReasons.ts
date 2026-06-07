// ─── Refuse Reason Types (Implio taxonomy) ──────────────────────
// Shared by ModerateByIdPage and QueuePage.

export const REFUSE_REASON_TYPES = [
  { value: "other", label: "Refuse (Other)", description: "General quality, pricing, or content issues", color: "bg-red-500", defaultMessage: "Your listing does not meet JamesEdition quality standards. Please review our listing guidelines and resubmit with the necessary improvements." },
  { value: "images", label: "Refuse (Images)", description: "Image quality, watermarks, or inappropriate images", color: "bg-orange-500", defaultMessage: "Your listing has been refused due to image quality issues. Please ensure all images are high-resolution, free of watermarks, and accurately represent the property. You may resubmit once the images have been updated." },
  { value: "wrong_category", label: "Refuse (Wrong Category)", description: "Listing placed in the wrong category", color: "bg-sky-500", defaultMessage: "Your listing has been refused because it was placed in the wrong category. Please resubmit it under the correct category." },
  { value: "inaccurate_data", label: "Refuse (Inaccurate Data)", description: "Incorrect or misleading listing information", color: "bg-teal-500", defaultMessage: "Your listing has been refused due to inaccurate or misleading information. Please verify all details (price, specifications, description) and resubmit with correct data." },
  { value: "sold", label: "Refuse (Sold)", description: "Property or item has already been sold", color: "bg-gray-500", defaultMessage: "Your listing has been refused as the item appears to have already been sold. Please remove sold listings from the feed to keep your inventory up to date." },
  { value: "duplicate", label: "Refuse (Duplicate)", description: "Duplicate or near-duplicate listing", color: "bg-amber-500", defaultMessage: "Your listing has been refused as it appears to be a duplicate of an existing listing on JamesEdition." },
  { value: "illegal", label: "Refuse (Illegal)", description: "Prohibited content or legal violations", color: "bg-purple-500", defaultMessage: "Your listing has been refused as it contains content that violates our terms of service." },
];
