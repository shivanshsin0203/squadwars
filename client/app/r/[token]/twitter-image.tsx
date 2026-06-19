// X / Twitter uses the same card as OpenGraph. Re-export so Next emits both
// og:image and twitter:image pointing at identical dynamic renders.
export { default, size, contentType, alt } from "./opengraph-image";
