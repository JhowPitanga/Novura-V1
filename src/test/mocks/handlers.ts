import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("*/rest/v1/*", () => {
    return HttpResponse.json([]);
  }),
  http.post("*/rest/v1/*", () => {
    return HttpResponse.json({});
  }),
];
