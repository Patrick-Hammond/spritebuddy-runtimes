-- SpriteBuddy runtime file (version 3) reading, timing, events and drawing rule, in plain Lua.
-- No Defold calls here, so it runs in any Lua 5.1+ or LuaJIT. See docs/format.md in the
-- spritebuddy-runtimes repository.
--
-- Everything is 1-based, as Lua is: frame `index` 1 is the file's frame 0, and an animation's
-- entry 1 is its first frame entry.
--
-- A parsed file:
--   { version, image, normals (or nil), size = { w, h }, scale, frames = { frame }, animations =
--     { animation }, by_name = { [name] = animation } }
-- A frame:
--   { name, x, y, w, h, rotated, trim_x, trim_y (0 when untrimmed), full_w, full_h,
--     pivot_x, pivot_y, trimmed }
-- An animation:
--   { name, loop = "loop" | "pingpong" | "once", frames = { entry } }
-- An entry:
--   { frame (1-based index into frames), duration (ms), offset_x, offset_y, layers = { layer },
--     events = { name } }
-- A layer:
--   { frame, x, y, z, opacity, flip_x, flip_y }

local M = {}

M.FORMAT = "spritebuddy-animations"
M.VERSION = 3
M.DEFAULT_DURATION = 100

local floor = math.floor

local function is_number(value)
	return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge
end

local function is_int(value)
	return is_number(value) and floor(value) == value
end

local function is_list(value)
	return type(value) == "table"
end

local function non_empty_string(value)
	return type(value) == "string" and value ~= ""
end

-- `length` whole numbers, each at least minimum[i] (nil for no minimum), or nil and an error.
local function ints(value, length, minimum)
	if not is_list(value) then
		return nil, ": expected a list"
	end
	if #value ~= length then
		return nil, ": expected " .. length .. " numbers"
	end
	for i = 1, length do
		local v = value[i]
		if not is_int(v) or (minimum[i] and v < minimum[i]) then
			return nil, "[" .. (i - 1) .. "]: expected a whole number" .. (minimum[i] and (" ≥ " .. minimum[i]) or "")
		end
	end
	return value
end

local function read_frame(value, sheet_w, sheet_h)
	if type(value) ~= "table" then
		return nil, ": expected an object"
	end
	if not non_empty_string(value.name) then
		return nil, ".name: expected a non-empty string"
	end
	local rect, err = ints(value.rect, 4, { 0, 0, 1, 1 })
	if not rect then
		return nil, ".rect" .. err
	end
	local rotated = value.rotated
	if rotated == nil then
		rotated = false
	end
	if type(rotated) ~= "boolean" then
		return nil, ".rotated: expected true or false"
	end
	local columns = rotated and rect[4] or rect[3]
	local rows = rotated and rect[3] or rect[4]
	if rect[1] + columns > sheet_w or rect[2] + rows > sheet_h then
		return nil, ".rect: lies outside the sheet"
	end
	local frame = {
		name = value.name,
		x = rect[1],
		y = rect[2],
		w = rect[3],
		h = rect[4],
		rotated = rotated,
		trimmed = false,
		trim_x = 0,
		trim_y = 0,
		full_w = rect[3],
		full_h = rect[4],
	}
	if value.trim ~= nil then
		local trim, terr = ints(value.trim, 4, { 0, 0, 1, 1 })
		if not trim then
			return nil, ".trim" .. terr
		end
		if trim[1] + rect[3] > trim[3] or trim[2] + rect[4] > trim[4] then
			return nil, ".trim: the trimmed pixels lie outside the full frame"
		end
		frame.trimmed = true
		frame.trim_x, frame.trim_y, frame.full_w, frame.full_h = trim[1], trim[2], trim[3], trim[4]
	end
	frame.pivot_x, frame.pivot_y = frame.full_w / 2, frame.full_h
	if value.pivot ~= nil then
		local p = value.pivot
		if not is_list(p) or #p ~= 2 or not is_number(p[1]) or not is_number(p[2]) then
			return nil, ".pivot: expected 2 numbers"
		end
		frame.pivot_x, frame.pivot_y = p[1], p[2]
	end
	return frame
end

local function frame_index(value, count)
	if not is_int(value) or value < 0 then
		return nil, "expected a whole number ≥ 0"
	end
	if value >= count then
		return nil, "no frame " .. value .. "; the file has " .. count
	end
	return value + 1
end

local function read_layer(value, count)
	if type(value) ~= "table" then
		return nil, ": expected an object"
	end
	local index, err = frame_index(value.frame, count)
	if not index then
		return nil, ".frame: " .. err
	end
	for _, key in ipairs({ "x", "y", "z" }) do
		if value[key] ~= nil and not is_int(value[key]) then
			return nil, "." .. key .. ": expected a whole number"
		end
	end
	local opacity = value.opacity
	if opacity == nil then
		opacity = 1
	end
	if not is_number(opacity) or opacity < 0 or opacity > 1 then
		return nil, ".opacity: expected a number from 0 to 1"
	end
	for _, key in ipairs({ "flipX", "flipY" }) do
		if value[key] ~= nil and type(value[key]) ~= "boolean" then
			return nil, "." .. key .. ": expected true or false"
		end
	end
	return {
		frame = index,
		x = value.x or 0,
		y = value.y or 0,
		z = value.z or 1,
		opacity = opacity,
		flip_x = value.flipX == true,
		flip_y = value.flipY == true,
	}
end

local function read_entry(value, duration, count)
	if is_number(value) then
		local index, err = frame_index(value, count)
		if not index then
			return nil, ": " .. err
		end
		return { frame = index, duration = duration, offset_x = 0, offset_y = 0, layers = {}, events = {} }
	end
	if type(value) ~= "table" then
		return nil, ": expected an object"
	end
	local index, err = frame_index(value.frame, count)
	if not index then
		return nil, ".frame: " .. err
	end
	if value.duration ~= nil then
		if not is_int(value.duration) or value.duration < 1 then
			return nil, ".duration: expected a whole number ≥ 1"
		end
		duration = value.duration
	end
	local entry = { frame = index, duration = duration, offset_x = 0, offset_y = 0, layers = {}, events = {} }
	if value.offset ~= nil then
		local offset, oerr = ints(value.offset, 2, {})
		if not offset then
			return nil, ".offset" .. oerr
		end
		entry.offset_x, entry.offset_y = offset[1], offset[2]
	end
	local layers = value.layers
	if layers ~= nil then
		if not is_list(layers) then
			return nil, ".layers: expected a list"
		end
		for i = 1, #layers do
			local layer, lerr = read_layer(layers[i], count)
			if not layer then
				return nil, ".layers[" .. (i - 1) .. "]" .. lerr
			end
			entry.layers[i] = layer
		end
	end
	local events = value.events
	if events ~= nil then
		if not is_list(events) then
			return nil, ".events: expected a list"
		end
		for i = 1, #events do
			if not non_empty_string(events[i]) then
				return nil, ".events[" .. (i - 1) .. "]: expected a non-empty string"
			end
			entry.events[i] = events[i]
		end
	end
	return entry
end

local LOOPS = { loop = true, pingpong = true, once = true }

local function read_animation(value, count)
	if type(value) ~= "table" then
		return nil, ": expected an object"
	end
	if not non_empty_string(value.name) then
		return nil, ".name: expected a non-empty string"
	end
	local loop = value.loop
	if loop == nil then
		loop = "loop"
	end
	if not LOOPS[loop] then
		return nil, '.loop: expected "loop", "pingpong" or "once"'
	end
	local duration = M.DEFAULT_DURATION
	if value.duration ~= nil then
		if not is_int(value.duration) or value.duration < 1 then
			return nil, ".duration: expected a whole number ≥ 1"
		end
		duration = value.duration
	end
	if not is_list(value.frames) then
		return nil, ".frames: expected a list"
	end
	local animation = { name = value.name, loop = loop, frames = {} }
	for i = 1, #value.frames do
		local entry, err = read_entry(value.frames[i], duration, count)
		if not entry then
			return nil, ".frames[" .. (i - 1) .. "]" .. err
		end
		animation.frames[i] = entry
	end
	return animation
end

--- Reads decoded runtime file data (from json.decode). Returns the file, or nil and an error
--- saying where it's wrong, such as `animations[0].frames[2]: no frame 9; the file has 8`.
function M.read(data)
	if type(data) ~= "table" then
		return nil, "expected an object"
	end
	if data.format ~= M.FORMAT then
		return nil, 'format: not a SpriteBuddy animations file (format should be "' .. M.FORMAT .. '")'
	end
	if not is_int(data.version) or data.version < 1 then
		return nil, "version: expected a whole number ≥ 1"
	end
	if data.version < 3 then
		return nil, "version: version " .. data.version .. " files need the sheet's own JSON; export again from SpriteBuddy for version " .. M.VERSION
	end
	if data.version > M.VERSION then
		return nil, "version: version " .. data.version .. " is newer than this runtime reads (" .. M.VERSION .. "); update the SpriteBuddy library"
	end
	if not non_empty_string(data.image) then
		return nil, "image: expected a non-empty string"
	end
	if data.normals ~= nil and not non_empty_string(data.normals) then
		return nil, "normals: expected a non-empty string"
	end
	local size, serr = ints(data.size, 2, { 1, 1 })
	if not size then
		return nil, "size" .. serr
	end
	local scale = 1
	if data.scale ~= nil then
		if not is_number(data.scale) or data.scale <= 0 then
			return nil, "scale: expected a positive number"
		end
		scale = data.scale
	end
	if not is_list(data.frames) then
		return nil, "frames: expected a list"
	end
	local file = {
		version = data.version,
		image = data.image,
		normals = data.normals,
		size = { size[1], size[2] },
		scale = scale,
		frames = {},
		animations = {},
		by_name = {},
	}
	for i = 1, #data.frames do
		local frame, err = read_frame(data.frames[i], size[1], size[2])
		if not frame then
			return nil, "frames[" .. (i - 1) .. "]" .. err
		end
		file.frames[i] = frame
	end
	local list = data.animations
	if list == nil then
		list = {}
	end
	if not is_list(list) then
		return nil, "animations: expected a list"
	end
	for i = 1, #list do
		local animation, err = read_animation(list[i], #file.frames)
		if not animation then
			return nil, "animations[" .. (i - 1) .. "]" .. err
		end
		if file.by_name[animation.name] then
			return nil, "animations[" .. (i - 1) .. '].name: duplicate animation "' .. animation.name .. '"'
		end
		file.by_name[animation.name] = animation
		file.animations[i] = animation
	end
	return file
end

-- --- Timing ---------------------------------------------------------------------------------

--- The entry indices one cycle visits: pingpong plays back without repeating the end frames.
function M.cycle_order(animation)
	local order = {}
	local count = #animation.frames
	for i = 1, count do
		order[i] = i
	end
	if animation.loop == "pingpong" and count > 2 then
		for i = count - 1, 2, -1 do
			order[#order + 1] = i
		end
	end
	return order
end

function M.cycle_duration(animation)
	local total = 0
	for _, i in ipairs(M.cycle_order(animation)) do
		total = total + animation.frames[i].duration
	end
	return total
end

--- Which entry shows `time` ms after the animation starts, and whether a `once` animation is
--- done. A frame shows from its start up to, not including, its end. Returns nil, true for an
--- animation with no frames.
function M.frame_at(animation, time)
	local order = M.cycle_order(animation)
	if #order == 0 then
		return nil, true
	end
	local total = M.cycle_duration(animation)
	local t = math.max(0, time)
	if animation.loop == "once" and t >= total then
		return order[#order], true
	end
	local rest = math.fmod(t, total)
	for _, i in ipairs(order) do
		rest = rest - animation.frames[i].duration
		if rest < 0 then
			return i, false
		end
	end
	return order[#order], false
end

--- The events of every entry that starts showing after `from` ms and up to and including `to`,
--- in the order they start: { { name = "hit", index = 2 }, ... }. An entry starting exactly at
--- `from` was already counted, so passing each tick's old and new time fires every event once,
--- even when a long tick skips short frames. One call fires at most one cycle's worth.
function M.events_between(animation, from, to)
	local fired = {}
	local order = M.cycle_order(animation)
	if #order == 0 or to <= from then
		return fired
	end
	local any = false
	for _, entry in ipairs(animation.frames) do
		if #entry.events > 0 then
			any = true
			break
		end
	end
	if not any then
		return fired
	end
	local total = M.cycle_duration(animation)
	local starts = {}
	local t = 0
	for k, i in ipairs(order) do
		starts[k] = t
		t = t + animation.frames[i].duration
	end
	local once = animation.loop == "once"
	local first = once and 0 or math.max(floor(math.max(0, from) / total), floor(to / total) - 1)
	local last = once and 0 or floor(to / total)
	local crossed = {}
	for cycle = first, last do
		for k = 1, #order do
			local at = cycle * total + starts[k]
			if at > from and at <= to then
				crossed[#crossed + 1] = order[k]
			end
		end
	end
	for c = math.max(1, #crossed - #order + 1), #crossed do
		local index = crossed[c]
		for _, name in ipairs(animation.frames[index].events) do
			fired[#fired + 1] = { name = name, index = index }
		end
	end
	return fired
end

-- --- Drawing --------------------------------------------------------------------------------

--- Everything to draw for an entry, bottom to top: { { frame, index, x, y, opacity, flip_x,
--- flip_y } }, where x, y is the part's full-frame top-left from the sprite's origin, in sheet
--- pixels with y down. The origin is the base frame's pivot, moved by the entry's offset.
function M.parts_of(file, entry)
	local base = file.frames[entry.frame]
	local left = entry.offset_x - base.pivot_x
	local top = entry.offset_y - base.pivot_y
	local stack = {
		{ z = 0, order = 0, frame = base, index = entry.frame, x = left, y = top, opacity = 1, flip_x = false, flip_y = false },
	}
	for i, layer in ipairs(entry.layers) do
		stack[#stack + 1] = {
			z = layer.z,
			order = i,
			frame = file.frames[layer.frame],
			index = layer.frame,
			x = left + layer.x,
			y = top + layer.y,
			opacity = layer.opacity,
			flip_x = layer.flip_x,
			flip_y = layer.flip_y,
		}
	end
	table.sort(stack, function(a, b)
		return a.z < b.z or (a.z == b.z and a.order < b.order)
	end)
	for _, part in ipairs(stack) do
		part.z = nil
		part.order = nil
	end
	return stack
end

--- The names of the file's animations, in file order.
function M.animation_names(file)
	local names = {}
	for i, animation in ipairs(file.animations) do
		names[i] = animation.name
	end
	return names
end

return M
