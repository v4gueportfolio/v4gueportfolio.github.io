const express = require('express');
const axios = require('axios');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000;

// === KEEPING YOUR ORIGINAL OAUTH2 CODE ===
app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('No code provided');
    try {
        const response = await axios.post('https://discord.com/api/v10/oauth2/token', new URLSearchParams({
            client_id: '1512761665719111892', 
            client_secret: process.env.DISCORD_SECRET, 
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: 'https://v4gueportfolio-github-io.onrender.com/callback'
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        res.send('Bot authorized successfully! You can close this tab now, Shafir.');
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).send('OAuth2 Exchange Failed');
    }
});

app.listen(PORT, () => console.log(`Web server blasting on port ${PORT}`));


// === BOT CODE WITH MANDATORY ROBLOX LINKS & GUILD NICKNAMES ===
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] }); // Added GuildMembers intent to read server profiles

const commands = [
    new SlashCommandBuilder()
        .setName('createevent')
        .setDescription('Create a new server event!')
        .addStringOption(option => option.setName('title').setDescription('Event title').setRequired(true))
        .addStringOption(option => option.setName('link').setDescription('Event link (Roblox ID or sub-link)').setRequired(true))
        .addNumberOption(option => option.setName
