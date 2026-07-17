-- TargetLockedBackDash.lua
-- Target-locked back-dash + Black Flash trigger (Roblox LocalScript)
-- Place this LocalScript in StarterPlayerScripts or a similar client-side context.

local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer
local UserInputService = game:GetService("UserInputService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local DASH_COOLDOWN = 0.4
local lastDashTap = 0
local SEARCH_RADIUS = 25
local BEHIND_DISTANCE = 3
local SECOND_ABILITY_DELAY = 0.32 -- mobile timing window delay

local function getNearestPlayer()
    local closestPlayer = nil
    local shortestDistance = SEARCH_RADIUS

    if not (LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")) then
        return nil
    end
    local myPos = LocalPlayer.Character.HumanoidRootPart.Position

    for _, player in pairs(Players:GetPlayers()) do
        if player ~= LocalPlayer and player.Character and player.Character:FindFirstChild("HumanoidRootPart") then
            local targetPos = player.Character.HumanoidRootPart.Position
            local distance = (myPos - targetPos).Magnitude
            if distance < shortestDistance then
                shortestDistance = distance
                closestPlayer = player
            end
        end
    end
    return closestPlayer
end

local function executeLockedBackDash(target)
    if not target or not target.Character then return end
    local myChar = LocalPlayer.Character
    local myHRP = myChar and myChar:FindFirstChild("HumanoidRootPart")
    local targetHRP = target.Character and target.Character:FindFirstChild("HumanoidRootPart")
    local camera = Workspace.CurrentCamera

    if not (myHRP and targetHRP and camera) then return end

    -- Compute position behind the target
    local backPosition = targetHRP.Position - (targetHRP.CFrame.LookVector * BEHIND_DISTANCE)

    -- Teleport behind them and face their torso
    myHRP.CFrame = CFrame.new(backPosition, targetHRP.Position)

    -- Force the camera to look at the target's torso (preserve camera position)
    camera.CFrame = CFrame.new(camera.CFrame.Position, targetHRP.Position)

    -- Execute the two ability activations in sequence (wrapped in pcall for safety)
    pcall(function()
        ReplicatedStorage.Events.ActivateAbility:FireServer(3)
    end)
    wait(SECOND_ABILITY_DELAY)
    pcall(function()
        ReplicatedStorage.Events.ActivateAbility:FireServer(3)
    end)
end

UserInputService.InputBegan:Connect(function(input, gameProcessed)
    if gameProcessed then return end

    local isTouch = (input.UserInputType == Enum.UserInputType.Touch)
    local isKeyQ = (input.KeyCode == Enum.KeyCode.Q)

    if isTouch or isKeyQ then
        local currentTime = tick()
        if (currentTime - lastDashTap) < DASH_COOLDOWN then
            local nearest = getNearestPlayer()
            if nearest then
                executeLockedBackDash(nearest)
            end
        end
        lastDashTap = currentTime
    end
end)
