export const MAP_STYLE = "./map_style.json";

export const INITIAL_VIEW_STATE = {
  longitude: 1.4428,
  latitude: 43.6048,
  zoom: 13,
  pitch: 0,
  bearing: 0
};

export const INITIAL_COLORS = {
  startNodeFill: [70, 183, 128],
  startNodeBorder: [255, 255, 255],
  endNodeFill: [152, 4, 12],
  endNodeBorder: [0, 0, 0],
  path: [70, 183, 128],
  route: [165, 13, 32],
  // Route finding colors
  startPoint: [46, 204, 113],    // Green for start
  endPoint: [231, 76, 60],       // Red for end
  routePath: [52, 152, 219],     // Blue for route
};
