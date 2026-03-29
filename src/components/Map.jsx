import DeckGL from "@deck.gl/react";
import { Map as MapGL } from "react-map-gl";
import maplibregl from "maplibre-gl";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { WebMercatorViewport } from "@deck.gl/core";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { INITIAL_COLORS, INITIAL_VIEW_STATE, MAP_STYLE } from "../config";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";

function getBackendWsUrl() {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${window.location.host}/api/ws`;
}

function Map() {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [selectedPoints, setSelectedPoints] = useState([]);
  const [roads, setRoads] = useState([]);
  const [routeData, setRouteData] = useState([]);
  const [hoveredRoad, setHoveredRoad] = useState(null);
  const [showRoads, setShowRoads] = useState(true);
  const [colors] = useState(INITIAL_COLORS);
  const ws = useRef(null);
  const fetchTimeout = useRef(null);
  const deckRef = useRef(null);

  // WebSocket setup
  useEffect(() => {
    if (!ws.current) {
      ws.current = new WebSocket(getBackendWsUrl());
      ws.current.onopen = () => {
        console.log("ws opened");
        // Fetch roads for initial viewport
        fetchRoadsForViewport(viewState);
      };
      ws.current.onclose = () => console.log("ws closed");
      ws.current.onmessage = (e) => {
        const data = JSON.parse(e.data);

        // Check if it's a roads response
        if (data.type === "roads") {
          console.log(`Got ${data.roads.length} roads`);
          setRoads(data.roads);
        } else {
          // It's route data (array of Pathing)
          console.log(`Got route data: ${data.length} segments`);
          setRouteData((prev) => [...prev, ...data]);
        }
      };
    }
  }, []);

  // Fetch roads for current viewport
  const fetchRoadsForViewport = useCallback(
    (vs) => {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
      if (!showRoads) return;

      // Use WebMercatorViewport to get actual bounds
      const viewport = new WebMercatorViewport({
        width: window.innerWidth,
        height: window.innerHeight,
        longitude: vs.longitude,
        latitude: vs.latitude,
        zoom: vs.zoom,
        pitch: vs.pitch || 0,
        bearing: vs.bearing || 0,
      });

      // Get the bounding box of the viewport
      const nw = viewport.unproject([0, 0]);
      const se = viewport.unproject([window.innerWidth, window.innerHeight]);

      // Add some margin to ensure we get roads at the edges
      const margin = 0.1;
      const lonMargin = (se[0] - nw[0]) * margin;
      const latMargin = (nw[1] - se[1]) * margin;

      const bbox = {
        command: "get_roads",
        min_lon: nw[0] - lonMargin,
        max_lon: se[0] + lonMargin,
        min_lat: se[1] - latMargin,
        max_lat: nw[1] + latMargin,
      };

      console.log(`Fetching roads for bbox: [${bbox.min_lon.toFixed(4)}, ${bbox.min_lat.toFixed(4)}] to [${bbox.max_lon.toFixed(4)}, ${bbox.max_lat.toFixed(4)}]`);
      ws.current.send(JSON.stringify(bbox));
    },
    [showRoads],
  );

  // Handle viewport change with debouncing
  const onViewStateChange = useCallback(
    ({ viewState: newViewState }) => {
      setViewState(newViewState);

      // Debounce the road fetching
      if (fetchTimeout.current) {
        clearTimeout(fetchTimeout.current);
      }
      fetchTimeout.current = setTimeout(() => {
        fetchRoadsForViewport(newViewState);
      }, 300);
    },
    [fetchRoadsForViewport],
  );

  // Handle map click for route selection
  async function mapClick(e) {
    if (!e.coordinate) return;

    const lon = e.coordinate[0];
    const lat = e.coordinate[1];

    const newPoint = { lon, lat };
    const newSelectedPoints = [...selectedPoints, newPoint];
    setSelectedPoints(newSelectedPoints);

    const selectPointCmd = {
      command: "select_point",
      lon,
      lat,
    };
    ws.current.send(JSON.stringify(selectPointCmd));

    if (newSelectedPoints.length >= 2) {
      setTimeout(() => setSelectedPoints([]), 500);
    }
  }

  function clearData() {
    setRouteData([]);
    setSelectedPoints([]);
  }

  // Create marker data for selected points
  const pointMarkers = selectedPoints.map((point, index) => ({
    position: [point.lon, point.lat],
    color: index === 0 ? colors.startPoint : colors.endPoint,
  }));

  // Color function for roads based on fun score
  const getRoadColor = useCallback((road) => {
    const fun = road.fun_data?.Fun?.total || 0;
    const r = Math.round(255 * (1 - fun / 100));
    const g = Math.round(255 * (fun / 100));
    return [r, g, 80, 180];
  }, []);

  // Color function for route paths
  const getRouteColor = useCallback(
    (d) => {
      if (d.color === "startPoint") return colors.startPoint;
      if (d.color === "endPoint") return colors.endPoint;
      if (d.color === "routePath" && d.fun_data) {
        const fun = d.fun_data?.Fun?.total || 0;
        const r = Math.round(255 * (1 - fun / 100));
        const g = Math.round(255 * (fun / 100));
        return [r, g, 80];
      }
      return colors[d.color] || [128, 128, 128];
    },
    [colors],
  );

  // Calculate route fun statistics
  const routeStats = useMemo(() => {
    const routeSegments = routeData.filter((d) => d.color === "routePath" && d.fun_data);
    if (routeSegments.length === 0) return null;

    const scores = routeSegments.map((d) => d.fun_data);
    const totalFun = scores.reduce((sum, s) => sum + s.total, 0);
    const avgFun = totalFun / scores.length;
    const totalTurns = scores.reduce((sum, s) => sum + s.turn_count, 0);
    const avgSpeed = scores.reduce((sum, s) => sum + s.speed_limit, 0) / scores.length;
    const outsideCityCount = scores.filter((s) => s.outside_city).length;
    const outsideCityPercent = (outsideCityCount / scores.length) * 100;

    return {
      segmentCount: routeSegments.length,
      avgFun: avgFun.toFixed(1),
      totalTurns,
      avgSpeed: avgSpeed.toFixed(0),
      outsideCityPercent: outsideCityPercent.toFixed(0),
    };
  }, [routeData]);

  // Layers
  const layers = [
    // Roads layer (background)
    showRoads &&
    new PathLayer({
      id: "roads-layer",
      data: roads,
      getPath: (d) => d.path,
      getColor: getRoadColor,
      getWidth: 3,
      widthMinPixels: 2,
      widthMaxPixels: 6,
      pickable: true,
      onHover: ({ object }) => setHoveredRoad(object || null),
    }),
    // Route layer (on top)
    new PathLayer({
      id: "route-layer",
      data: routeData,
      getPath: (d) => d.path,
      getColor: getRouteColor,
      getWidth: 5,
      widthMinPixels: 4,
      widthMaxPixels: 10,
      pickable: false,
    }),
    // Selected points markers
    new ScatterplotLayer({
      id: "markers-layer",
      data: pointMarkers,
      getPosition: (d) => d.position,
      getFillColor: (d) => d.color,
      getRadius: 12,
      radiusMinPixels: 8,
      radiusMaxPixels: 20,
      stroked: true,
      getLineColor: [255, 255, 255],
      lineWidthMinPixels: 2,
    }),
  ].filter(Boolean);

  return (
    <>
      <div
        onContextMenu={(e) => {
          e.preventDefault();
        }}
      >
        <DeckGL
          ref={deckRef}
          viewState={viewState}
          onViewStateChange={onViewStateChange}
          controller={{ doubleClickZoom: false, keyboard: false }}
          onClick={mapClick}
          layers={layers}
          getTooltip={({ object }) => {
            if (!object || !object.fun_data) return null;
            let html;
            if (object.fun_data.Fun) {
              html = `
                    <span>Fun Score:</span>
                    <strong style="color: ${object.fun_data.Fun.total > 50 ? "#4caf50" : "#ff9800"}">
                      ${object.fun_data.Fun.total.toFixed(1)}/100
                    </strong>
                    <span>Turns: ${object.fun_data.Fun.turn_count}</span>
                    <span>Speed: ${object.fun_data.Fun.speed_limit} km/h</span>`;
            } else {
              html = `<span>Boring:</span><span>Reason: ${object.fun_data.Boring}</span>`;
            }
            return {
              html: `
                <div style="padding: 8px; max-width: 250px;">
                  <strong>${object.name || "Unnamed Road"}</strong>
                  <br/>
                  <span style="color: #888;">${object.road_type || "road"}</span>
                  <hr style="margin: 6px 0; border-color: #444;"/>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                  ${html}
                  </div>
                </div>
              `,
              style: {
                backgroundColor: "rgba(30, 30, 30, 0.95)",
                color: "#fff",
                fontSize: "12px",
                borderRadius: "4px",
              },
            };
          }}
        >
          <MapGL reuseMaps mapLib={maplibregl} mapStyle={MAP_STYLE} doubleClickZoom={false} />
        </DeckGL>
      </div>

      <div className="inputs">
        <Box component="form" sx={{ "& > :not(style)": { m: 1 }, display: "flex", alignItems: "center", flexWrap: "wrap" }} noValidate autoComplete="off">
          <FormControlLabel
            control={
              <Switch
                checked={showRoads}
                onChange={(e) => {
                  setShowRoads(e.target.checked);
                  if (e.target.checked) {
                    fetchRoadsForViewport(viewState);
                  }
                }}
                size="small"
              />
            }
            label="Show Roads"
            sx={{ color: "#aaa" }}
          />

          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mx: 2 }}>
            <span style={{ color: "#aaa", fontSize: "0.875rem" }}>
              {selectedPoints.length === 0 && "Click to select start point"}
              {selectedPoints.length === 1 && "Click to select end point"}
              {selectedPoints.length >= 2 && "Computing route..."}
            </span>
          </Box>

          <Button variant="outlined" color="secondary" size="small" onClick={clearData}>
            Clear Route
          </Button>

          <Typography variant="caption" sx={{ color: "#666", ml: 2 }}>
            {roads.length} roads in view
          </Typography>
        </Box>
      </div>

      {/* Route Stats Panel */}
      {routeStats && (
        <Paper
          elevation={3}
          sx={{
            position: "absolute",
            top: 16,
            right: 16,
            p: 2,
            minWidth: 220,
            backgroundColor: "rgba(30, 30, 30, 0.95)",
          }}
        >
          <Typography variant="h6" gutterBottom sx={{ color: "#fff", fontSize: "1rem" }}>
            🎢 Route Fun Score
          </Typography>

          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="body2" sx={{ color: "#aaa" }}>
                Average Fun
              </Typography>
              <Typography variant="body2" sx={{ color: "#fff", fontWeight: "bold" }}>
                {routeStats.avgFun}/100
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={Number(routeStats.avgFun)}
              sx={{
                height: 8,
                borderRadius: 4,
                backgroundColor: "rgba(255,255,255,0.1)",
                "& .MuiLinearProgress-bar": {
                  backgroundColor: Number(routeStats.avgFun) > 50 ? "#4caf50" : "#ff9800",
                  borderRadius: 4,
                },
              }}
            />
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, fontSize: "0.8rem" }}>
            <Box>
              <Typography variant="caption" sx={{ color: "#888" }}>
                Segments
              </Typography>
              <Typography variant="body2" sx={{ color: "#fff" }}>
                {routeStats.segmentCount}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: "#888" }}>
                Total Turns
              </Typography>
              <Typography variant="body2" sx={{ color: "#fff" }}>
                {routeStats.totalTurns}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: "#888" }}>
                Avg Speed
              </Typography>
              <Typography variant="body2" sx={{ color: "#fff" }}>
                {routeStats.avgSpeed} km/h
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: "#888" }}>
                Outside City
              </Typography>
              <Typography variant="body2" sx={{ color: "#fff" }}>
                {routeStats.outsideCityPercent}%
              </Typography>
            </Box>
          </Box>

          <Box sx={{ mt: 2, pt: 1, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <Typography variant="caption" sx={{ color: "#666", display: "block" }}>
              🔴 Low fun → 🟢 High fun
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Legend */}
      {showRoads && !routeStats && (
        <Paper
          elevation={3}
          sx={{
            position: "absolute",
            top: 16,
            right: 16,
            p: 2,
            minWidth: 180,
            backgroundColor: "rgba(30, 30, 30, 0.95)",
          }}
        >
          <Typography variant="subtitle2" gutterBottom sx={{ color: "#fff" }}>
            Road Fun Score
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box
              sx={{
                width: "100%",
                height: 12,
                borderRadius: 1,
                background: "linear-gradient(to right, #ff5050, #ffff50, #50ff50)",
              }}
            />
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
            <Typography variant="caption" sx={{ color: "#888" }}>
              0
            </Typography>
            <Typography variant="caption" sx={{ color: "#888" }}>
              50
            </Typography>
            <Typography variant="caption" sx={{ color: "#888" }}>
              100
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: "#666", mt: 1, display: "block" }}>
            Hover over roads for details
          </Typography>
        </Paper>
      )}

      <div className="attrib-container">
        <summary className="maplibregl-ctrl-attrib-button" title="Toggle attribution" aria-label="Toggle attribution"></summary>
        <div className="maplibregl-ctrl-attrib-inner">
          ©{" "}
          <a href="https://carto.com/about-carto/" target="_blank" rel="noopener">
            CARTO
          </a>
          , ©{" "}
          <a href="http://www.openstreetmap.org/about/" target="_blank">
            OpenStreetMap
          </a>{" "}
          contributors
        </div>
      </div>
    </>
  );
}

export default Map;
