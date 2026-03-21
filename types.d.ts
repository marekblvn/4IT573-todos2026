import "hono";

declare module "hono" {
  interface Context {
    /**
     * `.redirectBack()` can Redirect back to Referer (based on `"Referer"` header), default status code is 302
     */
    redirectBack(): import("hono").TypedResponse<undefined, 302, "redirect">;
  }
}
