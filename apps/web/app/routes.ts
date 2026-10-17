import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("introduce", "routes/introduce.tsx"),
  route("founding", "routes/founding.tsx"),
  route("join", "routes/join.tsx"),
  route("join/cv", "routes/join.cv.tsx"),
  route("my-loop", "routes/my-loop.tsx"),
  route("my-loop/availability", "routes/my-loop.availability.tsx"),
] satisfies RouteConfig;
