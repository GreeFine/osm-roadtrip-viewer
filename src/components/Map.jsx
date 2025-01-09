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
  const depth = useRef();
  const bbox = useRef();

  async function mapClick(e, info, radius = null) {
    const searchParams = new URLSearchParams();
    console.log(depth.current);

    if (depth.current) {
      searchParams.append("depth", depth.current);
    }
    if (bbox.current) {
      searchParams.append("bbox", bbox.current);
    }
    searchParams.append("lon", e.coordinate[0]);
    searchParams.append("lat", e.coordinate[1]);

    const fetching = `http://localhost:8080/nodes?${searchParams.toString()}`
    console.log(fetching);
    const nodes_request = await fetch(fetching);
    if (nodes_request.ok) {
      const nodes = await nodes_request.json();
      setTripsData(() => nodes);
    } else {
      console.error("Unable to request nodes: ", nodes_request)
    }
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
          <TextField onChange={(e) => depth.current = e.target.value} color="secondary" id="depth" label="Max-Depth" variant="outlined" />
          <TextField onChange={(e) => bbox.current = e.target.value} id="bbox" label="Bounding-Box size" variant="outlined" />
        </Box>
      </div>
      <div className="attrib-container"><summary className="maplibregl-ctrl-attrib-button" title="Toggle attribution" aria-label="Toggle attribution"></summary><div className="maplibregl-ctrl-attrib-inner">© <a href="https://carto.com/about-carto/" target="_blank" rel="noopener">CARTO</a>, © <a href="http://www.openstreetmap.org/about/" target="_blank">OpenStreetMap</a> contributors</div></div>
    </>
  );
}

export default Map;