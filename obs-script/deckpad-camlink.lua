--[[
DeckPad ve CamLink için OBS kurulum betiği

OBS'te Araçlar > Betikler > + ile eklenir (StudioHub "OBS'i hazırla" ile kendiliğinden ekler).
Butonlar tekrar tekrar basılabilir: var olan sahne ve kaynaklara dokunulmaz, yalnızca eksikler eklenir.

  Ses efektleri  : klasördeki ses dosyaları "Ses Efektleri" sahnesine medya kaynağı olarak eklenir;
                   sahne diğer sahnelere bağlanır ki efektler her sahnede duyulsun.
                   DeckPad bu kaynakları "Ses efektleri" sayfasına kendiliğinden tuş olarak koyar.
  Slaytlar       : klasördeki görseller "Slaytlar" sahnesindeki "Slayt gösterisi" kaynağına eklenir (elle ilerletme).
                   DeckPad'in Önceki/Sonraki tuşları bu kaynağı kullanır.
  Telefon kamerası: CamLink eklentisi kuruluysa "CamLink telefon kamerası" kaynağı, değilse
                   SRT dinleyen bir Medya Kaynağı eklenir.
  Önerilen sahneler: Başlangıç, Kamera, Ekran, Ara ve Bitiş.
]]

obs = obslua

local SFX_SCENE = "Ses Efektleri"
-- OBS'te sahne ve kaynak adları ortak bir alanda olduğundan ikisi farklı adlandırılır.
local SLIDES_SCENE = "Slaytlar"
local SLIDES_NAME = "Slayt gösterisi"
local CAMERA_NAME = "Telefon kamerası"
local SRT_PORT = 9000
local AUDIO_EXT = { mp3 = true, wav = true, ogg = true, m4a = true, flac = true, aac = true, opus = true }

local settings_ref = nil

-- obs-defs.h'deki hizalama bayrakları betik arayüzüne aktarılmıyor.
local ALIGN_CENTER, ALIGN_LEFT, ALIGN_TOP = 0, 1, 4

local function log(msg)
	obs.script_log(obs.LOG_INFO, msg)
end

-- ---------------------------------------------------------------------------
-- Yardımcılar

local function source_exists(name)
	local s = obs.obs_get_source_by_name(name)
	if s ~= nil then
		obs.obs_source_release(s)
		return true
	end
	return false
end

local function has_type(id)
	return obs.obs_source_get_display_name(id) ~= nil
end

local function first_type(ids)
	for _, id in ipairs(ids) do
		if has_type(id) then
			return id
		end
	end
	return nil
end

-- Sahneyi bulur ya da oluşturur ve fn(scene) çağırır. Referanslar burada bırakılır.
local function with_scene(name, create, fn)
	local src = obs.obs_get_source_by_name(name)
	if src ~= nil then
		local scene = obs.obs_scene_from_source(src)
		local ok = scene ~= nil
		if ok then
			fn(scene, false)
		end
		obs.obs_source_release(src)
		return ok
	end
	if not create then
		return false
	end
	local scene = obs.obs_scene_create(name)
	fn(scene, true)
	obs.obs_scene_release(scene)
	return true
end

-- Var olan kaynağı sahneye ekler ya da yeni kaynak oluşturup ekler.
-- Döner: sahne öğesi, kaynak yeni mi oluşturuldu, öğe bu sahneye yeni mi eklendi.
local function add_source(scene, id, name, settings)
	local item = obs.obs_scene_find_source(scene, name)
	if item ~= nil then
		return item, false, false
	end
	local src = obs.obs_get_source_by_name(name)
	local created = false
	if src == nil then
		src = obs.obs_source_create(id, name, settings, nil)
		created = true
	end
	if src == nil then
		return nil, false, false
	end
	item = obs.obs_scene_add(scene, src)
	obs.obs_source_release(src)
	return item, created, item ~= nil
end

local function canvas()
	local ovi = obs.obs_video_info()
	if obs.obs_get_video_info(ovi) then
		return ovi.base_width, ovi.base_height
	end
	return 1920, 1080
end

local function fit(item, x, y, w, h)
	local pos = obs.vec2()
	pos.x = x
	pos.y = y
	obs.obs_sceneitem_set_pos(item, pos)
	obs.obs_sceneitem_set_alignment(item, ALIGN_LEFT + ALIGN_TOP)
	obs.obs_sceneitem_set_bounds_type(item, obs.OBS_BOUNDS_SCALE_INNER)
	obs.obs_sceneitem_set_bounds_alignment(item, ALIGN_CENTER)
	local b = obs.vec2()
	b.x = w
	b.y = h
	obs.obs_sceneitem_set_bounds(item, b)
end

local function list_files(dir, filter)
	local out = {}
	local d = obs.os_opendir(dir)
	if d == nil then
		return out
	end
	while true do
		local ent = obs.os_readdir(d)
		if ent == nil then
			break
		end
		if not ent.directory then
			local name = ent.d_name
			local ext = name:match("%.([^%.]+)$")
			if ext ~= nil and filter[ext:lower()] then
				table.insert(out, name)
			end
		end
	end
	obs.os_closedir(d)
	table.sort(out)
	return out
end

local function each_scene(fn)
	local scenes = obs.obs_frontend_get_scenes()
	if scenes == nil then
		return
	end
	for _, src in ipairs(scenes) do
		fn(src, obs.obs_scene_from_source(src))
	end
	obs.source_list_release(scenes)
end

-- ---------------------------------------------------------------------------
-- Ses efektleri

local function sfx_sources(fn)
	with_scene(SFX_SCENE, false, function(scene)
		local items = obs.obs_scene_enum_items(scene)
		if items ~= nil then
			for _, item in ipairs(items) do
				fn(obs.obs_sceneitem_get_source(item))
			end
			obs.sceneitem_list_release(items)
		end
	end)
end

-- Yeni eklenen ya da OBS açılırken yüklenen efektler kendiliğinden çalmasın.
local function stop_sfx()
	sfx_sources(function(src)
		obs.obs_source_media_stop(src)
	end)
end

local function stop_sfx_timer()
	obs.timer_remove(stop_sfx_timer)
	stop_sfx()
end

local function nest_sfx_everywhere()
	local sfx = obs.obs_get_source_by_name(SFX_SCENE)
	if sfx == nil then
		return 0
	end
	local count = 0
	each_scene(function(src, scene)
		if obs.obs_source_get_name(src) ~= SFX_SCENE and scene ~= nil and obs.obs_scene_find_source(scene, SFX_SCENE) == nil then
			local item = obs.obs_scene_add(scene, sfx)
			if item ~= nil then
				obs.obs_sceneitem_set_locked(item, true)
				count = count + 1
			end
		end
	end)
	obs.obs_source_release(sfx)
	return count
end

local function add_sfx()
	local dir = obs.obs_data_get_string(settings_ref, "sfx_dir")
	if dir == nil or dir == "" then
		return "Önce ses efektleri klasörünü seç."
	end
	local files = list_files(dir, AUDIO_EXT)
	if #files == 0 then
		return "Klasörde ses dosyası bulunamadı (mp3, wav, ogg, m4a, flac)."
	end
	local added = 0
	with_scene(SFX_SCENE, true, function(scene)
		for _, file in ipairs(files) do
			local name = file:gsub("%.[^%.]+$", "")
			-- Başka bir kaynak aynı adı kullanıyorsa ayırt edici ek konur.
			if obs.obs_scene_find_source(scene, name) == nil and source_exists(name) then
				name = name .. " (efekt)"
			end
			local s = obs.obs_data_create()
			obs.obs_data_set_bool(s, "is_local_file", true)
			obs.obs_data_set_string(s, "local_file", dir .. "/" .. file)
			obs.obs_data_set_bool(s, "looping", false)
			obs.obs_data_set_bool(s, "restart_on_activate", false)
			obs.obs_data_set_bool(s, "close_when_inactive", false)
			obs.obs_data_set_bool(s, "clear_on_media_end", true)
			local item, created = add_source(scene, "ffmpeg_source", name, s)
			obs.obs_data_release(s)
			if created and item ~= nil then
				-- Efektler yayında ve kulaklıkta duyulsun.
				obs.obs_source_set_monitoring_type(obs.obs_sceneitem_get_source(item), obs.OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT)
				added = added + 1
			end
		end
	end)
	local nested = 0
	if obs.obs_data_get_bool(settings_ref, "nest_sfx") then
		nested = nest_sfx_everywhere()
	end
	obs.timer_add(stop_sfx_timer, 400)
	log(string.format("Ses efektleri: %d yeni, %d sahneye bağlandı", added, nested))
	return string.format("%d ses efekti eklendi. \"%s\" sahnesi %d sahneye bağlandı. DeckPad'de Ses efektleri sayfası kendiliğinden dolar.", added, SFX_SCENE, nested)
end

-- ---------------------------------------------------------------------------
-- Slaytlar

local function add_slides()
	local dir = obs.obs_data_get_string(settings_ref, "slides_dir")
	if dir == nil or dir == "" then
		return "Önce slayt klasörünü seç."
	end
	local existing = obs.obs_get_source_by_name(SLIDES_NAME)
	local s = obs.obs_data_create()
	local files = obs.obs_data_array_create()
	local entry = obs.obs_data_create()
	-- Slayt gösterisi klasör verilince içindeki tüm görselleri sırayla alır.
	obs.obs_data_set_string(entry, "value", dir)
	obs.obs_data_set_bool(entry, "hidden", false)
	obs.obs_data_set_bool(entry, "selected", false)
	obs.obs_data_array_push_back(files, entry)
	obs.obs_data_release(entry)
	obs.obs_data_set_array(s, "files", files)
	obs.obs_data_array_release(files)
	obs.obs_data_set_string(s, "slide_mode", "mode_manual")
	obs.obs_data_set_string(s, "playback_behavior", "always_play")
	obs.obs_data_set_string(s, "transition", "fade")
	obs.obs_data_set_int(s, "transition_speed", 300)

	local msg
	if existing ~= nil then
		obs.obs_source_update(existing, s)
		obs.obs_source_release(existing)
		msg = "\"Slayt gösterisi\" kaynağı yeni klasörle güncellendi."
	else
		local w, h = canvas()
		with_scene(SLIDES_SCENE, true, function(scene)
			local item, _, added = add_source(scene, "slideshow", SLIDES_NAME, s)
			if added then
				fit(item, 0, 0, w, h)
			end
		end)
		if obs.obs_data_get_bool(settings_ref, "nest_sfx") then
			nest_sfx_everywhere()
		end
		msg = "\"Slaytlar\" sahnesi ve \"Slayt gösterisi\" kaynağı oluşturuldu. DeckPad'in Önceki/Sonraki tuşları bu kaynağı ilerletir."
	end
	obs.obs_data_release(s)
	log(msg)
	return msg
end

-- ---------------------------------------------------------------------------
-- Telefon kamerası

local function camera_settings()
	local s = obs.obs_data_create()
	if has_type("camlink_source") then
		return "camlink_source", s
	end
	obs.obs_data_set_bool(s, "is_local_file", false)
	obs.obs_data_set_string(s, "input", string.format("srt://0.0.0.0:%d?mode=listener&latency=120000", SRT_PORT))
	obs.obs_data_set_string(s, "input_format", "mpegts")
	obs.obs_data_set_int(s, "reconnect_delay_sec", 1)
	obs.obs_data_set_int(s, "buffering_mb", 1)
	obs.obs_data_set_bool(s, "hw_decode", true)
	obs.obs_data_set_bool(s, "restart_on_activate", false)
	obs.obs_data_set_bool(s, "close_when_inactive", false)
	obs.obs_data_set_bool(s, "clear_on_media_end", true)
	return "ffmpeg_source", s
end

local function add_camera_to(scene, x, y, w, h)
	local id, s = camera_settings()
	local item, _, added = add_source(scene, id, CAMERA_NAME, s)
	obs.obs_data_release(s)
	if added then
		fit(item, x, y, w, h)
	end
	return item ~= nil, id
end

local function add_camera()
	local current = obs.obs_frontend_get_current_scene()
	if current == nil then
		return "Önce bir sahne seç."
	end
	local scene = obs.obs_scene_from_source(current)
	local w, h = canvas()
	local ok, id = add_camera_to(scene, 0, 0, w, h)
	local name = obs.obs_source_get_name(current)
	obs.obs_source_release(current)
	if not ok then
		return "Kamera eklenemedi."
	end
	if id == "camlink_source" then
		return string.format("\"%s\" sahnesine eklendi. CamLink'te bu bilgisayarı seçmen yeterli.", name)
	end
	return string.format("\"%s\" sahnesine eklendi (eklenti yok, SRT %d dinleniyor). CamLink'te OBS hedefini seç.", name, SRT_PORT)
end

-- ---------------------------------------------------------------------------
-- Önerilen sahneler

local function add_background(scene, w, h)
	local id = first_type({ "color_source_v3", "color_source_v2", "color_source" })
	if id == nil then
		return
	end
	local s = obs.obs_data_create()
	obs.obs_data_set_int(s, "color", 0xFF30150B) -- ABGR: #0B1530
	obs.obs_data_set_int(s, "width", w)
	obs.obs_data_set_int(s, "height", h)
	-- Tüm sahneler aynı arka plan kaynağını paylaşır.
	local item = add_source(scene, id, "Arka plan", s)
	obs.obs_data_release(s)
	if item ~= nil then
		obs.obs_sceneitem_set_locked(item, true)
	end
end

local function add_title(scene, name, text, w, h)
	local id = first_type({ "text_gdiplus_v3", "text_gdiplus_v2", "text_gdiplus", "text_ft2_source_v2", "text_ft2_source" })
	if id == nil then
		return
	end
	local s = obs.obs_data_create()
	local font = obs.obs_data_create()
	obs.obs_data_set_string(font, "face", "Segoe UI Semibold")
	obs.obs_data_set_int(font, "size", math.floor(h / 9))
	obs.obs_data_set_obj(s, "font", font)
	obs.obs_data_release(font)
	obs.obs_data_set_string(s, "text", text)
	obs.obs_data_set_string(s, "align", "center")
	obs.obs_data_set_int(s, "color", 0xFFFFE7DC) -- ABGR: #DCE7FF
	obs.obs_data_set_int(s, "color1", 0xFFFFE7DC)
	obs.obs_data_set_int(s, "color2", 0xFFFFE7DC)
	local item = add_source(scene, id, name, s)
	obs.obs_data_release(s)
	if item ~= nil then
		local pos = obs.vec2()
		pos.x = w / 2
		pos.y = h / 2
		obs.obs_sceneitem_set_alignment(item, ALIGN_CENTER)
		obs.obs_sceneitem_set_pos(item, pos)
	end
end

local function add_scenes()
	local w, h = canvas()
	local made = {}
	local function scene(name, fill)
		if source_exists(name) then
			return
		end
		with_scene(name, true, function(sc)
			fill(sc)
		end)
		table.insert(made, name)
	end

	scene("Başlangıç", function(sc)
		add_background(sc, w, h)
		add_title(sc, "Başlangıç yazısı", "Birazdan başlıyoruz", w, h)
	end)
	scene("Kamera", function(sc)
		add_background(sc, w, h)
		add_camera_to(sc, 0, 0, w, h)
	end)
	scene("Ekran", function(sc)
		local cap = first_type({ "monitor_capture", "xshm_input_v2", "xshm_input", "pipewire-desktop-capture-source", "screen_capture" })
		if cap ~= nil then
			local s = obs.obs_data_create()
			local item = add_source(sc, cap, "Ekran yakalama", s)
			obs.obs_data_release(s)
			if item ~= nil then
				fit(item, 0, 0, w, h)
			end
		end
		-- Köşede küçük kamera
		local pw, ph = math.floor(w * 0.24), math.floor(h * 0.24)
		local item = obs.obs_scene_find_source(sc, CAMERA_NAME)
		if item == nil then
			local src = obs.obs_get_source_by_name(CAMERA_NAME)
			if src ~= nil then
				item = obs.obs_scene_add(sc, src)
				obs.obs_source_release(src)
			else
				add_camera_to(sc, 0, 0, pw, ph)
				item = obs.obs_scene_find_source(sc, CAMERA_NAME)
			end
		end
		if item ~= nil then
			fit(item, w - pw - math.floor(w * 0.025), h - ph - math.floor(h * 0.04), pw, ph)
		end
	end)
	scene("Ara", function(sc)
		add_background(sc, w, h)
		add_title(sc, "Ara yazısı", "Kısa bir ara veriyoruz", w, h)
	end)
	scene("Bitiş", function(sc)
		add_background(sc, w, h)
		add_title(sc, "Bitiş yazısı", "İzlediğiniz için teşekkürler", w, h)
	end)

	if obs.obs_data_get_bool(settings_ref, "nest_sfx") then
		nest_sfx_everywhere()
	end
	if #made == 0 then
		return "Önerilen sahnelerin hepsi zaten var."
	end
	local msg = "Oluşturulan sahneler: " .. table.concat(made, ", ") .. ". DeckPad'in Sahneler sayfası bağlanınca güncellenir."
	log(msg)
	return msg
end

-- ---------------------------------------------------------------------------
-- OBS arayüzü

local function report(props, msg)
	local p = obs.obs_properties_get(props, "status")
	if p ~= nil then
		obs.obs_property_set_description(p, msg)
		obs.obs_property_set_visible(p, true)
	end
	return true
end

function script_description()
	return [[<h3>DeckPad ve CamLink kurulumu</h3>
<p>DeckPad tuşlarının çalışacağı sahneleri ve kaynakları hazırlar. Butonlara tekrar basmak güvenlidir; yalnızca eksikler eklenir.</p>
<p>WebSocket bağlantısı ve DeckPad paneli için StudioHub'daki <b>OBS'i hazırla</b> düğmesini kullan.</p>]]
end

function script_properties()
	local p = obs.obs_properties_create()
	local status = obs.obs_properties_add_text(p, "status", "", obs.OBS_TEXT_INFO)
	obs.obs_property_set_visible(status, false)

	obs.obs_properties_add_path(p, "sfx_dir", "Ses efektleri klasörü", obs.OBS_PATH_DIRECTORY, "", nil)
	obs.obs_properties_add_button(p, "sfx_btn", "Ses efektlerini ekle", function(props)
		return report(props, add_sfx())
	end)
	obs.obs_properties_add_bool(p, "nest_sfx", "Ses efektleri her sahnede duyulsun")

	obs.obs_properties_add_path(p, "slides_dir", "Slayt klasörü", obs.OBS_PATH_DIRECTORY, "", nil)
	obs.obs_properties_add_button(p, "slides_btn", "Slaytları ekle", function(props)
		return report(props, add_slides())
	end)

	obs.obs_properties_add_button(p, "cam_btn", "Telefon kamerasını bu sahneye ekle", function(props)
		return report(props, add_camera())
	end)
	obs.obs_properties_add_button(p, "scenes_btn", "Önerilen sahneleri oluştur", function(props)
		return report(props, add_scenes())
	end)
	return p
end

function script_defaults(settings)
	obs.obs_data_set_default_bool(settings, "nest_sfx", true)
end

function script_update(settings)
	settings_ref = settings
end

-- Otomatik test: DECKPAD_SETUP_SELFTEST="ses klasörü|slayt klasörü" verilirse tüm adımlar sırayla çalışır.
-- Kullanıcılar bu değişkeni tanımlamadığı için normal kullanımda hiçbir etkisi yoktur.
local function selftest()
	local spec = os.getenv("DECKPAD_SETUP_SELFTEST") or ""
	local sfx, slides = spec:match("^(.-)|(.*)$")
	obs.obs_data_set_string(settings_ref, "sfx_dir", sfx or "")
	obs.obs_data_set_string(settings_ref, "slides_dir", slides or "")
	log("[selftest] sahneler: " .. add_scenes())
	log("[selftest] sahneler (2. kez): " .. add_scenes())
	log("[selftest] efektler: " .. add_sfx())
	log("[selftest] efektler (2. kez): " .. add_sfx())
	log("[selftest] slaytlar: " .. add_slides())
	log("[selftest] kamera: " .. add_camera())
	log("[selftest] bitti")
end

local selftest_pending = false

-- Ön yüz olayları arayüz iş parçacığında gelir; sahne ve kaynak oluşturmak burada güvenlidir.
local function on_event(event)
	if event == obs.OBS_FRONTEND_EVENT_FINISHED_LOADING or event == obs.OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGED then
		obs.timer_add(stop_sfx_timer, 300)
		if selftest_pending then
			selftest_pending = false
			selftest()
		end
	end
end

function script_load(settings)
	settings_ref = settings
	obs.obs_frontend_add_event_callback(on_event)
	stop_sfx()
	selftest_pending = os.getenv("DECKPAD_SETUP_SELFTEST") ~= nil
end

function script_unload()
	obs.obs_frontend_remove_event_callback(on_event)
end

-- Testler için: betik dosyası dışarıdan çağrılabilsin.
_G.deckpad_setup = {
	add_sfx = add_sfx,
	add_slides = add_slides,
	add_camera = add_camera,
	add_scenes = add_scenes,
	stop_sfx = stop_sfx,
}
