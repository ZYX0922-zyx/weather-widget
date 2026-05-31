/**
 * 读取当前显示器缩放信息，供窗口定位与拖动换算使用
 */

const { screen } = require("electron");

function queryPrimaryDisplay() {
  const display = screen.getPrimaryDisplay();
  return formatDisplay(display);
}

function queryDisplayAt(point) {
  const display = screen.getDisplayNearestPoint(point);
  return formatDisplay(display);
}

function queryDisplayForBounds(bounds) {
  const display = screen.getDisplayMatching(bounds);
  return formatDisplay(display);
}

function formatDisplay(display) {
  return {
    scaleFactor: display.scaleFactor,
    workArea: display.workArea,
    bounds: display.bounds,
  };
}

function dipPointToScreen(dipPoint) {
  return screen.dipToScreenPoint(dipPoint);
}

function screenPointToDip(screenPoint) {
  return screen.screenToDipPoint(screenPoint);
}

function getResizeEdgeAnchorScreen(bounds, edge) {
  const midX = bounds.x + bounds.width / 2;
  const midY = bounds.y + bounds.height / 2;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;

  switch (edge) {
    case "left":
      return dipPointToScreen({ x: bounds.x, y: midY });
    case "right":
      return dipPointToScreen({ x: right, y: midY });
    case "top":
      return dipPointToScreen({ x: midX, y: bounds.y });
    case "bottom":
      return dipPointToScreen({ x: midX, y: bottom });
    case "top-left":
      return dipPointToScreen({ x: bounds.x, y: bounds.y });
    case "top-right":
      return dipPointToScreen({ x: right, y: bounds.y });
    case "bottom-left":
      return dipPointToScreen({ x: bounds.x, y: bottom });
    case "bottom-right":
      return dipPointToScreen({ x: right, y: bottom });
    default:
      return dipPointToScreen({ x: midX, y: midY });
  }
}

module.exports = {
  queryPrimaryDisplay,
  queryDisplayAt,
  queryDisplayForBounds,
  dipPointToScreen,
  screenPointToDip,
  getResizeEdgeAnchorScreen,
};
