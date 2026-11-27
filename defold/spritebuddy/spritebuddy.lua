-- SpriteBuddy for Defold: loads a runtime file (`.anims.json`) and its sheet at run time and plays
-- its animations with per-frame timing, loop modes, offsets, live layers, frame events and,
-- when the file has a normal map, real-time lighting.
--
--   local spritebuddy = require "spritebuddy.spritebuddy"
--   local sheet = spritebuddy.load("/art/knight.anims.json")   -- list /art in custom_resources
--   self.knight = spritebuddy.player(sheet, { on_event = function(name) ... end })
--   self.knight:play("walk")
--   -- and in update(): self.knight:update(dt)
--
-- Most games use the `spritebuddy.go` game object instead, which wraps a player in a script
-- with properties and messages. See defold/README.md.

local core = require "spritebuddy.core"

local M = {}

M.core = core

--- The light that lights every player made with `lit = true`. Change its fields whenever you
--- like; players copy it to their sprites on each update. Positions are world coordinates
--- (y up), `z` is how far the light is towards the viewer, and it fades out `radius` units away.
--- `size` softens the terminator like SpriteBuddy Pro's light size, and `bands` (2 or more)
--- quantises it into cel bands.
M.light = {
	x = 0,
	y = 0,
	z = 60,
	radius = 400,
	color = vmath.vector3(1, 0.957, 0.878),
	brightness = 1,
	ambient = 0.35,
	size = 0.5,
	bands = 0,
}

local sheets = {}
local count = 0
local registry = {}

local FORMATS = {}

local function texture_format(image_type)
	if not FORMATS[image.TYPE_RGBA] then
		FORMATS[image.TYPE_RGBA] = graphics.TEXTURE_FORMAT_RGBA
		FORMATS[image.TYPE_RGB] = graphics.TEXTURE_FORMAT_RGB
		FORMATS[image.TYPE_LUMINANCE] = graphics.TEXTURE_FORMAT_LUMINANCE
		FORMATS[image.TYPE_LUMINANCE_ALPHA] = graphics.TEXTURE_FORMAT_LUMINANCE_ALPHA
	end
	return FORMATS[image_type]
end

-- The atlas animation id for frame `index` (1-based).
local function frame_id(index)
	return hash("f" .. index)
end

local function make_texture(path, bytes, premultiply)
	local img = image.load_buffer(bytes, { premultiply_alpha = premultiply, flip_vertically = true })
	if not img then
		return nil
	end
	local id = resource.create_texture(path, {
		width = img.width,
		height = img.height,
		type = graphics.TEXTURE_TYPE_2D,
		format = texture_format(img.type),
	}, img.buffer)
	return id, img.width, img.height
end

-- One atlas animation per frame, each a single quad whose pivot is the frame's pivot, so a
-- sprite showing it hangs from the game object's position. Trimmed frames get the quad of their
-- trimmed pixels with the pivot moved to match; rotated frames are marked rotated.
local function atlas_params(file, texture_path)
	local animations, geometries = {}, {}
	for i, frame in ipairs(file.frames) do
		local x, y, w, h = frame.x, frame.y, frame.w, frame.h
		local cols, rows = w, h
		if frame.rotated then
			cols, rows = h, w
		end
		geometries[i] = {
			id = "f" .. i,
			width = w,
			height = h,
			pivot_x = (frame.pivot_x - frame.trim_x) / w,
			pivot_y = (frame.pivot_y - frame.trim_y) / h,
			rotated = frame.rotated,
			vertices = { 0, 0, 0, h, w, h, w, 0 },
			uvs = { x, y, x, y + rows, x + cols, y + rows, x + cols, y },
			indices = { 0, 1, 2, 0, 2, 3 },
		}
		animations[i] = {
			id = "f" .. i,
			width = w,
			height = h,
			frames = { i },
			playback = go.PLAYBACK_NONE,
		}
	end
	return { texture = texture_path, animations = animations, geometries = geometries }
end

local function resolve(path, name)
	if name:sub(1, 1) == "/" then
		return name
	end
	return (path:match("^(.*/)") or "/") .. name
end

--- Makes a sheet from the runtime file's text and its image's bytes (PNG or JPEG), with an
--- optional normal map. `key` names the sheet's textures; loading the same key again returns
--- the sheet already made. Returns the sheet, or nil and an error.
function M.load_data(key, json_text, image_bytes, normal_bytes)
	if sheets[key] then
		return sheets[key]
	end
	local ok, data = pcall(json.decode, json_text)
	if not ok then
		return nil, "not valid JSON: " .. tostring(data)
	end
	local file, err = core.read(data)
	if not file then
		return nil, err
	end
	count = count + 1
	local base = "/spritebuddy/sheet" .. count
	local texture, width, height = make_texture(base .. ".texturec", image_bytes, true)
	if not texture then
		return nil, "can't decode the sheet image " .. file.image
	end
	if width ~= file.size[1] or height ~= file.size[2] then
		print(("SpriteBuddy: %s is %dx%d but the file says %dx%d"):format(file.image, width, height, file.size[1], file.size[2]))
	end
	local sheet = {
		key = key,
		file = file,
		texture = texture,
		atlas = resource.create_atlas(base .. ".texturesetc", atlas_params(file, base .. ".texturec")),
	}
	if normal_bytes then
		-- The normal map isn't premultiplied: its alpha is the sheet's, and the shader takes the
		-- sheet's alpha.
		local normal_texture = make_texture(base .. "_n.texturec", normal_bytes, false)
		if normal_texture then
			sheet.normal_texture = normal_texture
			sheet.normal_atlas = resource.create_atlas(base .. "_n.texturesetc", atlas_params(file, base .. "_n.texturec"))
		else
			print("SpriteBuddy: can't decode the normal map " .. tostring(file.normals) .. "; drawing unlit")
		end
	end
	sheets[key] = sheet
	return sheet
end

--- Loads a runtime file and the sheet image beside it (and its normal map, when it names one)
--- with sys.load_resource, so list their folder in game.project's custom_resources. Returns the
--- sheet, or nil and an error. Loading the same path again returns the same sheet.
function M.load(path)
	if sheets[path] then
		return sheets[path]
	end
	local text = sys.load_resource(path)
	if not text then
		return nil, "can't read " .. path .. "; is its folder in game.project's custom_resources?"
	end
	local ok, data = pcall(json.decode, text)
	if not ok or type(data) ~= "table" then
		return nil, path .. " is not valid JSON"
	end
	if type(data.image) ~= "string" then
		local _, err = core.read(data)
		return nil, path .. ": " .. tostring(err)
	end
	local image_path = resolve(path, data.image)
	local image_bytes = sys.load_resource(image_path)
	if not image_bytes then
		return nil, "can't read the sheet " .. image_path
	end
	local normal_bytes
	if type(data.normals) == "string" and data.normals ~= "" then
		normal_bytes = sys.load_resource(resolve(path, data.normals))
		if not normal_bytes then
			print("SpriteBuddy: can't read the normal map " .. resolve(path, data.normals) .. "; drawing unlit")
		end
	end
	local sheet, err = M.load_data(path, text, image_bytes, normal_bytes)
	if not sheet then
		return nil, path .. ": " .. err
	end
	return sheet
end

--- Frees a sheet's textures. Delete its players first.
function M.unload(sheet)
	if sheets[sheet.key] ~= sheet then
		return
	end
	sheets[sheet.key] = nil
	resource.release(sheet.atlas)
	resource.release(sheet.texture)
	if sheet.normal_atlas then
		resource.release(sheet.normal_atlas)
		resource.release(sheet.normal_texture)
	end
end

-- --- Names for hash properties -----------------------------------------------------------

local known_paths = nil

local function add_path(path)
	known_paths[hash(path)] = path
	-- And by its name alone: "/art/knight.anims.json" is also "knight".
	known_paths[hash(path:match("([^/]*)%.anims%.json$") or path)] = path
end

--- Lets a hash (such as spritebuddy.script's `sheet` property) find its runtime file, since a
--- hash can't be turned back into text: afterwards both the path and the name alone ("knight"
--- for "/art/knight.anims.json") find it. The files in game.project's `[spritebuddy] files`
--- setting (comma-separated), and any .anims.json files its custom_resources list one by one,
--- are added for you.
function M.add_path(path)
	M.path_of(hash(""))
	add_path(path)
end

--- The path of the runtime file named by `h` (a hash of its path or of its name alone), or nil
--- when it isn't known (see M.add_path). A string is returned as it is.
function M.path_of(h)
	if type(h) == "string" then
		return h
	end
	if not known_paths then
		known_paths = {}
		local lists = sys.get_config_string("project.custom_resources", "") .. "," .. sys.get_config_string("spritebuddy.files", "")
		for item in lists:gmatch("[^,]+") do
			local path = item:match("^%s*(.-)%s*$")
			if path:sub(-11) == ".anims.json" then
				add_path(path)
			end
		end
	end
	return known_paths[h]
end

--- The name of the animation in `sheet` whose hash is `h` (or `h` itself when it is a string),
--- or nil.
function M.name_of(sheet, h)
	if type(h) == "string" then
		return h
	end
	local names = sheet.names
	if not names then
		names = {}
		for _, animation in ipairs(sheet.file.animations) do
			names[hash(animation.name)] = animation.name
		end
		sheet.names = names
	end
	return names[h]
end

-- --- Players --------------------------------------------------------------------------------

local Player = {}
Player.__index = Player

local DEFAULT_FACTORY = "#part_factory"
local DEFAULT_LIT_FACTORY = "#lit_part_factory"

--- Makes a player that draws `sheet` with sprites made by a factory, as children of `parent`.
--- Options (all optional):
---   parent: the game object the sprite hangs from; its position is the frame's pivot. Default:
---     the calling script's game object.
---   factory, lit_factory: factories of spritebuddy/part.go and spritebuddy/lit_part.go. Default:
---     "#part_factory" and "#lit_part_factory" on the calling script's game object.
---   lit: draw with the sheet's normal map, lit by M.light. Default false; ignored when the
---     sheet has no normal map.
---   pixel_scale: world units per sheet pixel. Default 1.
---   on_frame(index), on_event(name, index), on_done(animation_name): called as frames change,
---     as frame events fire (after on_frame) and when a `once` animation ends (last).
function M.player(sheet, options)
	options = options or {}
	local self = setmetatable({}, Player)
	self.sheet = sheet
	self.file = sheet.file
	self.parent = options.parent or go.get_id()
	self.factory = options.factory or msg.url(DEFAULT_FACTORY)
	self.lit_factory = options.lit_factory or msg.url(DEFAULT_LIT_FACTORY)
	self.lit = sheet.normal_atlas ~= nil and options.lit == true
	self.pixel_scale = options.pixel_scale or 1
	self.on_frame = options.on_frame
	self.on_event = options.on_event
	self.on_done = options.on_done
	self.speed = 1
	self.flip_x = false
	self.flip_y = false
	self.playing = false
	self.time = 0
	self.index = nil
	self.animation = nil
	self.done = false
	self.parts = {}
	self.pool = {}
	return self
end

--- Starts `name` from its start, or from `from` ms. Fires the first frame's events.
function Player:play(name, from)
	local animation = self.file.by_name[name]
	if not animation then
		print(('SpriteBuddy: no animation "%s"; this file has %s'):format(tostring(name), table.concat(core.animation_names(self.file), ", ")))
		return false
	end
	self.animation = animation
	self.index = nil
	self.done = false
	self.playing = true
	self.time = math.max(0, from or 0)
	local fired = {}
	local first = core.frame_at(animation, self.time)
	if first then
		for _, event_name in ipairs(animation.frames[first].events) do
			fired[#fired + 1] = { name = event_name, index = first }
		end
	end
	self:refresh(fired)
	return true
end

function Player:stop()
	self.playing = false
end

--- Jumps to `ms` into the animation without firing events.
function Player:seek(ms)
	self.time = math.max(0, ms)
	self:refresh()
end

--- Moves time on by `dt` seconds (times `speed`). Call it from update().
function Player:update(dt)
	if self.playing and self.animation then
		local from = self.time
		self.time = self.time + math.max(0, dt) * 1000 * self.speed
		self:refresh(core.events_between(self.animation, from, self.time))
	end
	if self.lit then
		self:apply_light()
	end
end

--- Mirrors the whole sprite about its pivot.
function Player:set_flip(flip_x, flip_y)
	self.flip_x = flip_x and true or false
	self.flip_y = flip_y and true or false
	self:draw(true)
end

--- The name of the animation playing (or last played), or nil.
function Player:animation_name()
	return self.animation and self.animation.name
end

-- Works out the entry showing now, redraws when it changed, then calls on_frame, on_event and
-- on_done in that order.
function Player:refresh(fired)
	if not self.animation then
		return
	end
	local index, done = core.frame_at(self.animation, self.time)
	local changed = index ~= self.index
	self.index = index
	if changed then
		self:draw(false)
		if index and self.on_frame then
			self.on_frame(index)
		end
	end
	if fired and self.on_event then
		for _, event in ipairs(fired) do
			self.on_event(event.name, event.index)
		end
	end
	if done and not self.done then
		self.done = true
		self.playing = false
		if self.on_done then
			self.on_done(self.animation.name)
		end
	end
end

local function sprite_url(id)
	return msg.url(nil, id, "sprite")
end

function Player:make_part()
	local url = self.lit and self.lit_factory or self.factory
	local id = factory.create(url, vmath.vector3(), nil, nil, 1)
	go.set_parent(id, self.parent, false)
	url = sprite_url(id)
	go.set(url, "image", self.sheet.atlas)
	if self.lit then
		go.set(url, "image", self.sheet.normal_atlas, { key = "normal_sampler" })
	end
	return { id = id, url = url, enabled = true }
end

-- Places a sprite per part: each part's game object sits at the part's pivot (the sprite hangs
-- from there), mirrored about it for flips, with the sheet's y down turned to Defold's y up.
function Player:draw(force)
	local parts = self.index and core.parts_of(self.file, self.animation.frames[self.index]) or {}
	local s = self.pixel_scale
	for i, part in ipairs(parts) do
		local p = self.pool[i]
		if not p then
			p = self:make_part()
			self.pool[i] = p
		elseif not p.enabled then
			msg.post(p.id, "enable")
			p.enabled = true
		end
		local frame = part.frame
		local flip_x = part.flip_x ~= self.flip_x
		local flip_y = part.flip_y ~= self.flip_y
		-- Unflipped, the sprite hangs from the frame's pivot. Flipped, Defold mirrors it about
		-- that point, so move the point to where the mirrored frame keeps its full-frame box.
		local px = part.x + (part.flip_x and (frame.full_w - frame.pivot_x) or frame.pivot_x)
		local py = part.y + (part.flip_y and (frame.full_h - frame.pivot_y) or frame.pivot_y)
		if self.flip_x then
			px = -px
		end
		if self.flip_y then
			py = -py
		end
		go.set_position(vmath.vector3(px * s, -py * s, i * 0.0001), p.id)
		if p.frame ~= part.index or force or p.flip_x ~= flip_x or p.flip_y ~= flip_y then
			sprite.play_flipbook(p.url, frame_id(part.index))
			sprite.set_hflip(p.url, flip_x)
			sprite.set_vflip(p.url, flip_y)
			p.frame, p.flip_x, p.flip_y = part.index, flip_x, flip_y
			if self.lit then
				go.set(p.url, "sb_flags", vmath.vector4(flip_x and -1 or 1, flip_y and -1 or 1, frame.rotated and 1 or 0, 0))
			end
		end
		if p.opacity ~= part.opacity then
			go.set(p.url, "tint.w", part.opacity)
			p.opacity = part.opacity
		end
		if s ~= 1 and p.scale ~= s then
			go.set_scale(s, p.id)
			p.scale = s
		end
	end
	for i = #parts + 1, #self.pool do
		local p = self.pool[i]
		if p.enabled then
			msg.post(p.id, "disable")
			p.enabled = false
		end
	end
	self.parts = parts
end

--- Copies M.light (or `light`) to the sprite's lit parts.
function Player:apply_light(light)
	light = light or M.light
	local pos = vmath.vector4(light.x, light.y, light.z, light.radius)
	local color = vmath.vector4(light.color.x, light.color.y, light.color.z, light.brightness)
	local params = vmath.vector4(light.ambient, 0.6 * light.size, light.bands or 0, 0)
	for _, p in ipairs(self.pool) do
		if p.enabled then
			go.set(p.url, "light_pos", pos)
			go.set(p.url, "light_color", color)
			go.set(p.url, "light_params", params)
		end
	end
end

--- The game objects drawing the current frame's parts, bottom to top.
function Player:part_ids()
	local ids = {}
	for i = 1, #self.parts do
		ids[i] = self.pool[i].id
	end
	return ids
end

--- Deletes the sprite's part game objects.
function Player:delete()
	for _, p in ipairs(self.pool) do
		go.delete(p.id)
	end
	self.pool = {}
	self.parts = {}
end

-- Game object ids repeat in different collections (loaded through proxies), so players are
-- kept by socket and path.
local function key_of(url)
	return hash_to_hex(url.socket) .. hash_to_hex(url.path)
end

local function url_of(id)
	if type(id) == "string" then
		return msg.url(id)
	elseif types.is_url(id) then
		return id
	end
	return msg.url(nil, id, nil)
end

--- Remembers `player` as the one drawing game object `id` (a hash, string or url), for M.get().
--- Pass nil to forget it. spritebuddy.script does this for you.
function M.register(id, player)
	registry[key_of(url_of(id))] = player
end

--- The player a spritebuddy.script is running on game object `id` (a hash, string or url, such as
--- "/hero"), so a script can call it directly: spritebuddy.get("/hero"):play("attack").
function M.get(id)
	return registry[key_of(url_of(id))]
end

return M
