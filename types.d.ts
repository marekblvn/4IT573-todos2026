import "hono";

declare module "hono" {
  interface Context {
    /**
     * `.redirectBack()` can Redirect back to Referer (based on `"Referer"` header), default status code is 302
     * @param {string} fallbackUrl - redirect to this url if referer fails, defaults to `"/"`
     */
    redirectBack(
      fallbackUrl?: string,
    ): import("hono").TypedResponse<undefined, 302, "redirect">;
  }
}
