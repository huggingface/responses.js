import type { Request, Response } from "express";

export function getHealth(req: Request, res: Response): void {
	res.send("OK");
}
