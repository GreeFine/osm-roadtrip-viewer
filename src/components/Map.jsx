import DeckGL from "@deck.gl/react";
import { Map as MapGL } from "react-map-gl";
import maplibregl from "maplibre-gl";
import { TripsLayer } from "@deck.gl/geo-layers";
import { useEffect, useRef, useState } from "react";
import { INITIAL_COLORS, INITIAL_VIEW_STATE, MAP_STYLE } from "../config";
import Box from '@mui/material/Box';
import TextField from "@mui/material/TextField";

function Map() {
  const [tripsData, setTripsData] = useState([]);
  const [time, setTime] = useState(0);
  const [colors, setColors] = useState(INITIAL_COLORS);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const depth = useRef(5);
  const bbox = useRef(10_000);
  const ws = useRef(null);
  const tripsDataBuffer = useRef([]);

  useEffect(() => {
    ws.current = new WebSocket("ws://localhost:8080/ws");
    ws.current.onopen = () => console.log("ws opened");
    ws.current.onclose = () => console.log("ws closed");
    ws.current.onmessage = e => {
      const nodes = JSON.parse(e.data);
      console.log(`Got data, new nodes: ${nodes.length}, current nodes: ${tripsDataBuffer.current.length}`);
      tripsDataBuffer.current.push(...nodes);

      setTripsData([...tripsDataBuffer.current]);
    };

    const wsCurrent = ws.current;

    return () => {
      wsCurrent.close();
    };
  }, []);



  async function mapClick(e, info, radius = null) {
    const searchParams = {
      depth: depth.current,
      bbox: bbox.current,
      lon: e.coordinate[0],
      lat: e.coordinate[1],
    };

    ws.current.send(JSON.stringify(searchParams));
  }

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(res => {
      changeLocation(res.coords);
    });
  }, []);

  return (
    <>
      <div onContextMenu={(e) => { e.preventDefault(); }}>
        <DeckGL
          initialViewState={viewState}
          controller={{ doubleClickZoom: false, keyboard: false }}
          onClick={mapClick}
        >
          <TripsLayer
            id={"pathfinding-layer"}
            data={tripsData}
            opacity={1}
            widthMinPixels={3}
            widthMaxPixels={5}
            fadeTrail={false}
            currentTime={time}
            getColor={d => colors[d.color]}
            // getColor={(d) => {
            //   if (d.color !== "path") return colors[d.color];
            //   const color = colors[d.color];
            //   const delta = Math.abs(time - d.timestamp);
            //   return color.map(c => Math.max((c * 1.6) - delta * 0.1, c));
            // }}
            updateTriggers={{
              getColor: [colors.path, colors.route]
            }}
          />
          <MapGL
            reuseMaps mapLib={maplibregl}
            mapStyle={MAP_STYLE}
            doubleClickZoom={false}
          />
        </DeckGL>
      </div>
      <div className="inputs">
        <Box
          component="form"
          sx={{ '& > :not(style)': { m: 1, width: '25ch' } }}
          noValidate
          autoComplete="off"
        >
          <TextField onChange={(e) => depth.current = Number(e.target.value)} type="number" color="secondary" id="depth" label="Max-Depth" variant="outlined" />
          <TextField onChange={(e) => bbox.current = Number(e.target.value)} type="number" id="bbox" label="Bounding-Box size" variant="outlined" />
        </Box>
      </div>
      <div className="attrib-container"><summary className="maplibregl-ctrl-attrib-button" title="Toggle attribution" aria-label="Toggle attribution"></summary><div className="maplibregl-ctrl-attrib-inner">© <a href="https://carto.com/about-carto/" target="_blank" rel="noopener">CARTO</a>, © <a href="http://www.openstreetmap.org/about/" target="_blank">OpenStreetMap</a> contributors</div></div>
    </>
  );
}

export default Map;