-- Builds one indexed .aseprite from the trace data scripts/aseprite.ts writes (iteration 91, docs/ART_PIPELINES.md). Ported
-- from Azyrion Tamer's tools/aseprite/build_sprite.lua, cut down to one image: index 0 transparent, index 1 the outline ink.
-- Run: Aseprite -b --script-param data=<sprite>.trace.lua --script-param out=<sprite>.aseprite --script build_sprite.lua

local D = dofile(app.params["data"])
local out = app.params["out"]
local CHARS = "0123456789abcdefghijklmnopqrstuv"

local spr = Sprite(D.w, D.h, ColorMode.INDEXED)
spr.transparentColor = 0
local pal = Palette(#D.palette)
for i, c in ipairs(D.palette) do
  pal:setColor(i - 1, Color{ r = c[1], g = c[2], b = c[3], a = (i == 1) and 0 or 255 })
end
spr:setPalette(pal)

local img = Image(D.w, D.h, ColorMode.INDEXED)
img:clear(0)
for y = 1, #D.rows do
  local row = D.rows[y]
  for x = 1, #row do
    local v = CHARS:find(row:sub(x, x), 1, true) - 1
    if v > 0 then img:drawPixel(x - 1, y - 1, v) end
  end
end
spr.layers[1].name = D.name
spr:newCel(spr.layers[1], spr.frames[1], img, Point(0, 0))
spr:saveAs(out)
spr:close()
print("built " .. out)
