/**
 * A deliberately simplified outline of Africa (equirectangular projection),
 * drawn from coastline waypoints. Precise enough to read as the continent at
 * a glance, light enough to inline (~2 KB).
 */

type LatLon = readonly [lat: number, lon: number];

export const VIEW = { width: 720, height: 740 };

export function project([lat, lon]: LatLon): { x: number; y: number } {
  return { x: (lon + 19) * 10, y: (38 - lat) * 10 };
}

const mainland: LatLon[] = [
  [35.8, -5.9],
  [35.2, -2.0],
  [36.8, 3.0],
  [37.2, 9.8],
  [36.9, 11.1],
  [34.0, 10.2],
  [32.9, 13.2],
  [30.4, 19.4],
  [32.8, 21.9],
  [31.6, 25.1],
  [31.2, 29.9],
  [31.3, 32.3],
  [29.9, 32.6],
  [27.2, 33.8],
  [22.0, 36.9],
  [19.6, 37.2],
  [15.6, 39.5],
  [12.6, 43.3],
  [11.6, 43.1],
  [10.4, 44.5],
  [11.8, 51.3],
  [8.0, 49.8],
  [2.0, 45.3],
  [-1.7, 41.5],
  [-4.0, 39.7],
  [-6.8, 39.3],
  [-10.5, 40.4],
  [-15.0, 40.7],
  [-19.8, 34.9],
  [-25.9, 32.6],
  [-29.9, 31.0],
  [-34.0, 25.6],
  [-34.8, 20.0],
  [-34.2, 18.4],
  [-28.6, 16.4],
  [-22.9, 14.5],
  [-17.3, 11.8],
  [-12.4, 13.6],
  [-8.8, 13.2],
  [-6.0, 12.3],
  [-0.7, 8.8],
  [3.8, 9.5],
  [4.4, 7.0],
  [6.4, 3.4],
  [5.6, -0.2],
  [4.7, -2.1],
  [5.3, -4.0],
  [4.4, -7.5],
  [6.3, -10.8],
  [8.5, -13.2],
  [10.5, -15.0],
  [14.7, -17.5],
  [20.8, -17.0],
  [23.7, -15.9],
  [27.9, -12.9],
  [30.4, -9.6],
  [33.6, -7.6],
];

const madagascar: LatLon[] = [
  [-12.0, 49.3],
  [-15.5, 50.5],
  [-20.0, 48.8],
  [-25.0, 47.0],
  [-25.6, 45.1],
  [-21.5, 43.3],
  [-16.2, 44.4],
  [-13.5, 48.2],
];

function toPath(points: LatLon[]): string {
  return (
    points
      .map((p, i) => {
        const { x, y } = project(p);
        return `${i === 0 ? "M" : "L"}${x.toFixed(0)} ${y.toFixed(0)}`;
      })
      .join(" ") + " Z"
  );
}

export const continentPath = `${toPath(mainland)} ${toPath(madagascar)}`;

export const hub = project([-1.29, 36.82]); // Nairobi

/** Illustrative destinations for expansion routes — not current operations. */
export const destinations = [
  [0.35, 32.58], // Kampala
  [-1.95, 30.06], // Kigali
  [-6.8, 39.28], // Dar es Salaam
  [9.03, 38.74], // Addis Ababa
  [-15.42, 28.28], // Lusaka
  [-26.2, 28.05], // Johannesburg
  [6.52, 3.38], // Lagos
  [5.6, -0.19], // Accra
  [14.72, -17.47], // Dakar
  [30.04, 31.24], // Cairo
  [33.57, -7.59], // Casablanca
  [-4.32, 15.31], // Kinshasa
].map((p) => project(p as unknown as LatLon));

export function arc(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  return `M${from.x.toFixed(0)} ${from.y.toFixed(0)} Q${mx.toFixed(0)} ${(my - dist * 0.28).toFixed(0)} ${to.x.toFixed(0)} ${to.y.toFixed(0)}`;
}
