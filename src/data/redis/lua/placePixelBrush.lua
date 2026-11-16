
local ret = {0, 0, 0, 0, 0, 0}
if ARGV[10] ~= "nope" then
  if ARGV[7] == "0" then
    ret[1] = 6
    return ret
  end
  if ARGV[10] == "top" then
    local pr = redis.call('zrank', KEYS[8], ARGV[7])
    if not pr or pr > 9 then
      ret[1] = 12
      return ret
    end
  else
    local req = tonumber(ARGV[10])
    if req > 0 then
      local sc = tonumber(redis.call('zscore', KEYS[3], ARGV[7]))
      if not sc or sc < req then
        ret[1] = 7
        return ret
      end
    end
  end
end

local cd = redis.call('pttl', KEYS[1])
if cd < 0 then
  cd = tonumber(ARGV[14]) or 0
end
if KEYS[2] ~= "nope" then
  local icd = redis.call('pttl', KEYS[2])
  if icd > cd then
    cd = icd
  end
end

local pointCount = tonumber(ARGV[12])
if not pointCount or pointCount < 1 or pointCount > 100 then
  ret[1] = 5
  return ret
end
local cds = tonumber(ARGV[13]) or 60000
local pxlcd = 0
local pxlcnt = 0
local cli = tonumber(ARGV[1])
local blankColorIndex = tonumber(ARGV[2])
local canSkipBlankCooldown = ARGV[3] == "1"
local canSkipPixelCooldown = ARGV[4] == "1"
local bcd = tonumber(ARGV[5])
local pcd = tonumber(ARGV[6])
local previousStamp = -1
for point = 1, pointCount do
  local argIndex = 15 + (point - 1) * 4
  local keyIndex = tonumber(ARGV[argIndex])
  local offset = tonumber(ARGV[argIndex + 1])
  local color = tonumber(ARGV[argIndex + 2])
  local stampIndex = tonumber(ARGV[argIndex + 3])
  if not keyIndex or keyIndex < 9 or keyIndex > 108
    or not offset or offset < 0 or offset >= 65536
    or not color or color < 0 or color > 255
    or not stampIndex or stampIndex < 0 or stampIndex > 99
    or stampIndex < previousStamp
  then
    ret[1] = 5
    break
  end
  previousStamp = stampIndex
  local sclr = redis.call('bitfield', KEYS[keyIndex], 'get', 'u8', offset * 8)
  sclr = sclr[1]
  if sclr >= 128 then
    ret[1] = 8
    break
  end
  local canSkipCooldown = canSkipBlankCooldown
  local pixelCooldown = bcd
  if sclr >= cli and sclr ~= blankColorIndex then
    pixelCooldown = pcd
    canSkipCooldown = canSkipPixelCooldown
  end
  if pixelCooldown == 0 and not canSkipCooldown then
    ret[1] = 5
    break
  end
  if cd + pixelCooldown > cds then
    ret[1] = 9
    ret[4] = math.max(0, cds - cd)
    break
  end
  cd = cd + pixelCooldown
  pxlcd = pixelCooldown
  pxlcnt = pxlcnt + 1
end

if ARGV[11] == "0" and pxlcnt > 0 then
  if cd > 0 then
    redis.call('set', KEYS[1], '', 'px', cd)
    if KEYS[2] ~= "nope" then
      redis.call('set', KEYS[2], '', 'px', cd)
    end
  end
  if KEYS[4] ~= "nope" then
    if ARGV[7] ~= "0" then
      redis.call('zincrby', KEYS[3], pxlcnt, ARGV[7])
      redis.call('zincrby', KEYS[4], pxlcnt, ARGV[7])
      if ARGV[8] ~= "0" then
        redis.call('zincrby', KEYS[5], pxlcnt, ARGV[8])
        redis.call('zincrby', KEYS[6], pxlcnt, ARGV[8])
      end
    end
    if ARGV[9] ~= "xx" then
      redis.call('zincrby', KEYS[7], pxlcnt, ARGV[9])
    end
  end
end

ret[2] = pxlcnt
ret[3] = cd
ret[4] = pxlcd
return ret
