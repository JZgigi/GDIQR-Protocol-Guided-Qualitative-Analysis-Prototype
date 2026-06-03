export type StorageMode = "local" | "supabase";

export function getStorageMode(): StorageMode {
  const value =
    process.env.STORAGE_MODE ?? process.env.NEXT_PUBLIC_STORAGE_MODE ?? "local";
  return value === "supabase" ? "supabase" : "local";
}

export function isLocalStorageMode() {
  return getStorageMode() === "local";
}
