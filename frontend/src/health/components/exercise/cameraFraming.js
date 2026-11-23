// Where the body must be for the pose model to see every joint it needs.
// Pure geometry on normalized MediaPipe landmarks (0–1 of the camera image),
// so the preview guide and its tests share one rule.

const EDGE = .02;          // a joint this close to the border is treated as cut off
const MIN_HEIGHT = {standing: .42, seated: .34};
const HEAD = [0, 7, 8];    // nose and ears tell us whether the head is in view

export function framingPose(posture) {
  if (posture === 'floor' || posture === 'supine' || posture === 'prone') return 'floor';
  if (posture === 'seated') return 'seated';
  return 'standing';
}

const seen = point => point && Number.isFinite(point.x) && Number.isFinite(point.y) && (point.visibility ?? 1) >= .35;

/**
 * @returns {{state:'searching'|'ok'|'cut'|'far', edges:string[], hint:string}}
 * edges are image sides ('top','bottom','left','right') a needed joint crosses.
 */
export function framingStatus(landmarks, required = [], posture = 'standing') {
  const pose = framingPose(posture);
  const needed = [...new Set([...required, ...(pose === 'floor' ? [] : HEAD)])];
  const points = needed.map(i => landmarks?.[i]).filter(seen);
  if (!landmarks?.length || points.length < Math.max(2, needed.length / 2)) {
    return {state: 'searching', edges: [], hint: pose === 'floor' ? '매트 위 몸 전체가 점선 안에 들어오게 휴대폰을 옆에 두세요' : '몸 전체가 점선 안에 들어오도록 서 주세요'};
  }
  const edges = [];
  const outside = (test) => needed.some(i => {const p = landmarks[i]; return !seen(p) ? false : test(p);});
  // A needed joint the model could not place at all is usually outside the image.
  const missing = needed.filter(i => !seen(landmarks[i]));
  if (outside(p => p.y < EDGE)) edges.push('top');
  if (outside(p => p.y > 1 - EDGE)) edges.push('bottom');
  if (outside(p => p.x < EDGE)) edges.push('left');
  if (outside(p => p.x > 1 - EDGE)) edges.push('right');
  if (!edges.length && missing.length) {
    // Decide which side lost the joints from the ones that are visible.
    const ys = points.map(p => p.y), xs = points.map(p => p.x);
    const missingFeet = missing.some(i => i >= 25), missingHead = missing.some(i => i <= 10);
    if (missingFeet && pose !== 'floor') edges.push('bottom');
    if (missingHead && pose !== 'floor') edges.push('top');
    if (!edges.length) edges.push(Math.min(...xs) < 1 - Math.max(...xs) ? 'left' : 'right');
    if (!edges.length && Math.max(...ys) > .9) edges.push('bottom');
  }
  if (edges.length) return {state: 'cut', edges, hint: cutHint(edges, pose)};
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const extent = pose === 'floor' ? Math.max(...xs) - Math.min(...xs) : Math.max(...ys) - Math.min(...ys);
  if (extent < (pose === 'floor' ? .35 : MIN_HEIGHT[pose])) return {state: 'far', edges: [], hint: '조금 더 가까이 와 주세요'};
  return {state: 'ok', edges: [], hint: '좋아요 · 이 위치를 유지하세요'};
}

function cutHint(edges, pose) {
  const vertical = edges.includes('top') && edges.includes('bottom');
  if (vertical || (pose !== 'floor' && edges.length > 1)) return '몸이 화면보다 커요 · 한두 걸음 뒤로 가 주세요';
  if (edges.includes('top')) return pose === 'floor' ? '머리 쪽이 잘렸어요 · 휴대폰을 조금 더 멀리 두세요' : '머리가 잘렸어요 · 한 걸음 뒤로 가거나 휴대폰을 낮춰 주세요';
  if (edges.includes('bottom')) return pose === 'floor' ? '발 쪽이 잘렸어요 · 휴대폰을 조금 더 멀리 두세요' : '발이 잘렸어요 · 한 걸음 뒤로 가거나 휴대폰을 아래로 기울여 주세요';
  return pose === 'floor' ? '몸이 옆으로 잘렸어요 · 휴대폰을 몸 가운데 옆으로 옮겨 주세요' : '몸이 화면 옆으로 벗어났어요 · 가운데로 옮겨 주세요';
}
