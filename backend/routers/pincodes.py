import re

from fastapi import APIRouter, Depends, HTTPException

from db import db
from helpers import get_current_user, require_role
from models import BulkPincodeReq, CreatePincodeReq, Pincode

router = APIRouter()


@router.get("/pincodes")
async def list_pincodes(_: dict = Depends(get_current_user)):
    return await db.pincodes.find({"active": True}, {"_id": 0}) \
        .sort("code", 1).to_list(1000)


@router.get("/admin/pincodes")
async def admin_list_pincodes(_: dict = Depends(require_role("admin"))):
    return await db.pincodes.find({}, {"_id": 0}) \
        .sort("code", 1).to_list(2000)


@router.post("/admin/pincodes")
async def admin_create_pincode(req: CreatePincodeReq,
                               _: dict = Depends(require_role("admin"))):
    code = req.code.strip()
    if not re.fullmatch(r"\d{6}", code):
        raise HTTPException(400, "Pincode must be 6 digits")
    existing = await db.pincodes.find_one({"code": code}, {"_id": 0})
    if existing:
        await db.pincodes.update_one(
            {"code": code}, {"$set": {"area": req.area, "active": True}})
        return await db.pincodes.find_one({"code": code}, {"_id": 0})
    p = Pincode(code=code, area=req.area)
    await db.pincodes.insert_one(p.dict())
    return p.dict()


@router.post("/admin/pincodes/bulk")
async def admin_bulk_pincodes(req: BulkPincodeReq,
                              _: dict = Depends(require_role("admin"))):
    added = 0
    updated = 0
    for raw in re.split(r"[,\n\r]+", req.text):
        raw = raw.strip()
        if not raw:
            continue
        parts = re.split(r"[:\-]", raw, maxsplit=1)
        code = parts[0].strip()
        area = parts[1].strip() if len(parts) > 1 else ""
        if not re.fullmatch(r"\d{6}", code):
            continue
        existing = await db.pincodes.find_one({"code": code}, {"_id": 0})
        if existing:
            await db.pincodes.update_one(
                {"code": code},
                {"$set": {"active": True,
                          "area": area or existing.get("area", "")}},
            )
            updated += 1
        else:
            await db.pincodes.insert_one(
                Pincode(code=code, area=area).dict())
            added += 1
    return {"added": added, "updated": updated}


@router.delete("/admin/pincodes/{code}")
async def admin_delete_pincode(code: str,
                               _: dict = Depends(require_role("admin"))):
    res = await db.pincodes.update_one({"code": code}, {"$set": {"active": False}})
    if res.matched_count == 0:
        raise HTTPException(404, "Pincode not found")
    return {"deactivated": code}
