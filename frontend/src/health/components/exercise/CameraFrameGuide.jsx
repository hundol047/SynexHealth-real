import React from 'react';
import {framingPose} from './cameraFraming.js';

// Outline of where to stand, drawn over the live preview only. The recorded
// clip is the camera stream itself, so it never contains this overlay.
// Shapes are authored in a 100×100 box and fitted, undistorted, to the camera image.
const SHAPES = {
  standing: {box: [34, 7, 32, 86], path: 'M50 7a6 6 0 1 1 0 12a6 6 0 1 1 0-12M42 21h16l6 30h-4l-3-24v66h-6l-1-36l-1 36h-6v-66l-3 24h-4z'},
  seated: {box: [26, 14, 48, 74], path: 'M44 14a6 6 0 1 1 0 12a6 6 0 1 1 0-12M37 28h14l4 28h16l3 32h-6l-3-24h-22l-4-36z'},
  floor: {box: [8, 52, 84, 22], path: 'M14 58a5 5 0 1 1 0 10a5 5 0 1 1 0-10M22 60h40l26 4v6l-26-2h-40z'},
};

// The feed's CSS mirrors every overlay svg with the front camera, so edges stay
// in camera-image coordinates here, exactly like the landmark skeleton.
export default function CameraFrameGuide({posture, status, size = [640, 480]}) {
  const [width, height] = size, pose = framingPose(posture), shape = SHAPES[pose], state = status?.state || 'idle';
  const scale = Math.min(width, height) / 100, left = (width - 100 * scale) / 2, top = (height - 100 * scale) / 2;
  const [x, y, w, h] = shape.box, inset = Math.min(width, height) * .04, corner = Math.min(width, height) * .08;
  const edges = new Set(status?.edges || []);
  return <svg className={`coach-frame-guide is-${state}`} data-framing={state} aria-hidden="true" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
    <g transform={`translate(${left} ${top}) scale(${scale})`}>
      <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx="3" className="coach-frame-box"/>
      <path className="coach-frame-body" d={shape.path}/>
    </g>
    {[[inset, inset, 1, 1], [width - inset, inset, -1, 1], [inset, height - inset, 1, -1], [width - inset, height - inset, -1, -1]].map(([cx, cy, dx, dy]) =>
      <path key={`${dx}${dy}`} className="coach-frame-corner" d={`M${cx} ${cy + dy * corner}V${cy}H${cx + dx * corner}`}/>)}
    {edges.has('top') && <line className="coach-frame-cut" x1="0" y1="2" x2={width} y2="2"/>}
    {edges.has('bottom') && <line className="coach-frame-cut" x1="0" y1={height - 2} x2={width} y2={height - 2}/>}
    {edges.has('left') && <line className="coach-frame-cut" x1="2" y1="0" x2="2" y2={height}/>}
    {edges.has('right') && <line className="coach-frame-cut" x1={width - 2} y1="0" x2={width - 2} y2={height}/>}
  </svg>;
}
