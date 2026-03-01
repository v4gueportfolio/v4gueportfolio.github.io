-- Hi script stealers this is open source so dont worry just steal anything you'd like!

-- Main: 
repeat task.wait() until game:IsLoaded()
repeat task.wait() until game.Players.LocalPlayer and game.Players.LocalPlayer.Character

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local StarterGui = game:GetService("StarterGui")

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera
local holdingRightClick, espEnabled, target = false, false, nil

-- Clean Notification 🤐✌️😭
StarterGui:SetCore("SendNotification", {
    Title = "Invisible Aimbot",
    Text = "Made by V 4 G U E",
    Duration = 7,
    Button1 = "OK"
})

local espFolder = Instance.new("Folder")
espFolder.Name = "ShafirVision"
local success, _ = pcall(function() espFolder.Parent = game:GetService("CoreGui") end)
if not success then espFolder.Parent = player:WaitForChild("PlayerGui") end

local function createESP(p)
    if p == player then return end
    local function setup(char)
        if not char then return end
        local root = char:WaitForChild("HumanoidRootPart", 10)
        if not root then return end
        if espFolder:FindFirstChild(p.Name .. "_ESP") then espFolder[p.Name .. "_ESP"]:Destroy() end
        
        local bgu = Instance.new("BillboardGui", espFolder)
        bgu.Name, bgu.AlwaysOnTop, bgu.Size, bgu.Adornee = p.Name .. "_ESP", true, UDim2.new(4, 0, 6, 0), root
        
        local frame = Instance.new("Frame", bgu)
        frame.Size, frame.BackgroundTransparency = UDim2.new(1, 0, 1, 0), 1
        local stroke = Instance.new("UIStroke", frame)
        stroke.Thickness, stroke.ApplyStrokeMode = 1.2, Enum.ApplyStrokeMode.Border

        local info = Instance.new("TextLabel", bgu)
        info.Size, info.Position, info.BackgroundTransparency = UDim2.new(1, 0, 0.2, 0), UDim2.new(0, 0, -0.3, 0), 1
        info.TextColor3, info.TextSize, info.Font, info.TextStrokeTransparency = Color3.new(1, 1, 1), 16, Enum.Font.Code, 0.5

        RunService.RenderStepped:Connect(function()
            local isEnemy = not teamCheck or (p.Team ~= player.Team or p.Team == nil)
            if char and char:FindFirstChild("Humanoid") and isEnemy then
                stroke.Color = Color3.fromHSV(tick() % 3 / 3, 1, 1)
                info.Text = p.Name .. " [" .. math.floor(char.Humanoid.Health) .. " HP]"
                bgu.Enabled = espEnabled
            else 
                bgu.Enabled = false 
            end
        end)
    end
    p.CharacterAdded:Connect(setup)
    if p.Character then setup(p.Character) end
end

UserInputService.InputBegan:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton2 then
        holdingRightClick = true
        local closest, shortest = nil, math.huge
        local center = Vector2.new(camera.ViewportSize.X / 2, camera.ViewportSize.Y / 2)
        
        for _, p in pairs(Players:GetPlayers()) do
            local isEnemy = not teamCheck or (p.Team ~= player.Team or p.Team == nil)
            if p ~= player and isEnemy and p.Character and p.Character:FindFirstChild("HumanoidRootPart") then
                local dist = (player.Character.HumanoidRootPart.Position - p.Character.HumanoidRootPart.Position).Magnitude
                if p.Character.Humanoid.Health > 0 and dist <= maxDist then
                    local pos, onScreen = camera:WorldToViewportPoint(p.Character.HumanoidRootPart.Position)
                    if onScreen then
                        local mD = (Vector2.new(pos.X, pos.Y) - center).Magnitude
                        if mD < shortest then shortest, closest = mD, p end
                    end
                end
            end
        end
        target = closest
    elseif input.KeyCode == Enum.KeyCode.RightShift then espEnabled = not espEnabled end
end)

UserInputService.InputEnded:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton2 then holdingRightClick, target = false, nil end
end)

RunService.RenderStepped:Connect(function()
    if holdingRightClick and target and target.Character then
        local goal = (targetPart == "Head") and target.Character:FindFirstChild("Head") or (target.Character:FindFirstChild("UpperTorso") or target.Character:FindFirstChild("Torso"))
        if goal then 
            camera.CFrame = camera.CFrame:Lerp(CFrame.new(camera.CFrame.Position, goal.Position), smoothness) 
        end
    end
end)

for _, p in pairs(Players:GetPlayers()) do createESP(p) end
Players.PlayerAdded:Connect(createESP)
