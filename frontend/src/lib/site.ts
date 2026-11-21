/** Source repository, shown in the footer and on the About page (override with VITE_REPO_URL). */
export const REPO_URL: string =
  (import.meta.env.VITE_REPO_URL as string | undefined) ??
  'https://github.com/kartikya2522/animal-species-classification-cnn'
