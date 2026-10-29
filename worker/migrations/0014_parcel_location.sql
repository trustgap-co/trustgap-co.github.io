-- Where the parcel was when the buyer reported a problem during delivery: 'rider' (refused at the
-- door, the rider took it back) or 'buyer' (the rider left it with them). Decides which return starts.
ALTER TABLE disputes ADD COLUMN parcel_location TEXT;
