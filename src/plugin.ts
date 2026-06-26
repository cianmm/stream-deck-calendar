import streamDeck from "@elgato/streamdeck";
import { NextMeetingAction } from "./actions/next-meeting";

streamDeck.actions.registerAction(new NextMeetingAction());
streamDeck.connect();
