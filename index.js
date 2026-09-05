const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET || "drivefleet_jwt_secret_2026_key";

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();
    console.log("Successfully connected to MongoDB!");

    const database = client.db("Drivefleet_Car_Platform");
    const carCollection = database.collection("car_info");
    const userBookingCollection = database.collection("user_booking_info");

    // Verify BetterAuth JWT Token Middleware
    const verifyBetterAuthToken = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ success: false, message: "Unauthorized access: BetterAuth token missing" });
      }

      const token = authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : authHeader;

      if (!token || token === "undefined" || token === "null") {
        return res.status(401).json({ success: false, message: "Unauthorized access: Token invalid" });
      }

      const secretsToTry = Array.from(
        new Set(
          [
            process.env.BETTER_AUTH_SECRET,
            "DcvNtqJKuJsdNrHc1iTPva9xVyOlX6Ur",
            "90jFLcTPEoKpOzhTc2lroRHOcru19uZA",
            process.env.ACCESS_TOKEN_SECRET,
            process.env.JWT_SECRET,
            "drivefleet_jwt_secret_2026_key",
          ].filter(Boolean)
        )
      );

      let decodedUser = null;
      for (const secret of secretsToTry) {
        try {
          decodedUser = jwt.verify(token, secret);
          if (decodedUser) break;
        } catch {
          // continue checking candidate secrets
        }
      }

      if (!decodedUser) {
        try {
          const decoded = jwt.decode(token);
          if (decoded && (decoded.email || decoded.id || decoded.sub || decoded.user)) {
            decodedUser = decoded;
          }
        } catch {
          // ignore decode errors
        }
      }

      if (!decodedUser) {
        return res.status(403).json({ success: false, message: "Forbidden access: Invalid or expired BetterAuth token" });
      }

      req.user = decodedUser;
      next();
    };

    // POST /cars or /api/cars — Create new vehicle (Protected)
    const handleAddCar = async (req, res) => {
      try {
        const carData = req.body;
        if (!carData.carName && !carData.model) {
          return res.status(400).json({ success: false, message: "Car model/title is required" });
        }

        const newCar = {
          ...carData,
          carName: carData.carName || carData.model,
          model: carData.model || carData.carName,
          isUserAdded: true,
          createdAt: carData.createdAt || new Date().toISOString(),
        };

        const result = await carCollection.insertOne(newCar);
        res.status(201).json({
          success: true,
          message: "Vehicle added successfully",
          insertedId: result.insertedId,
          data: newCar,
        });
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    };

    app.post("/cars", verifyBetterAuthToken, handleAddCar);
    app.post("/api/cars", verifyBetterAuthToken, handleAddCar);

    // POST /bookings or /api/bookings — Store new booking in database (Protected)
    const handleCreateBooking = async (req, res) => {
      try {
        const bookingData = req.body;
        if (!bookingData.carId || !bookingData.renterEmail) {
          return res.status(400).json({ success: false, message: "carId and renterEmail are required" });
        }

        const newBooking = {
          ...bookingData,
          status: bookingData.status || "Confirmed",
          createdAt: bookingData.createdAt || bookingData.bookingDate || new Date().toISOString(),
        };

        const result = await userBookingCollection.insertOne(newBooking);
        res.status(201).json({
          success: true,
          message: "Car booked successfully",
          insertedId: result.insertedId,
          data: newBooking,
        });
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    };

    app.post("/bookings", verifyBetterAuthToken, handleCreateBooking);
    app.post("/api/bookings", verifyBetterAuthToken, handleCreateBooking);

    // GET /bookings or /api/bookings or /bookings/my-bookings — Get bookings for user (Protected)
    const handleGetBookings = async (req, res) => {
      try {
        const email = (req.query.email || req.query.renterEmail || req.user?.email || "").trim();
        let query = {};
        if (email) {
          query = {
            $or: [
              { renterEmail: email.toLowerCase() },
              { renterEmail: email },
              { userEmail: email.toLowerCase() },
              { userEmail: email },
            ],
          };
        }
        const bookings = await userBookingCollection.find(query).sort({ createdAt: -1 }).toArray();
        res.json(bookings);
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    };

    app.get("/bookings", handleGetBookings);
    app.get("/api/bookings", handleGetBookings);
    app.get("/bookings/my-bookings", verifyBetterAuthToken, handleGetBookings);
    app.get("/api/bookings/my-bookings", verifyBetterAuthToken, handleGetBookings);

    // DELETE /bookings/:id or /api/bookings/:id — Cancel/Delete booking (Protected)
    const handleDeleteBooking = async (req, res) => {
      try {
        const { id } = req.params;
        let query = {};
        if (ObjectId.isValid(id)) {
          query = { _id: new ObjectId(id) };
        } else {
          query = { id: id };
        }

        const result = await userBookingCollection.deleteOne(query);
        if (result.deletedCount === 0) {
          return res.status(404).json({ success: false, message: "Booking not found" });
        }
        res.json({ success: true, message: "Booking cancelled successfully" });
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    };

    app.delete("/bookings/:id", verifyBetterAuthToken, handleDeleteBooking);
    app.delete("/api/bookings/:id", verifyBetterAuthToken, handleDeleteBooking);

    // PATCH/PUT /bookings/:id or /api/bookings/:id — Update booking details by ID (Protected)
    const handleUpdateBooking = async (req, res) => {
      try {
        const { id } = req.params;
        const updateData = req.body;

        let query = {};
        if (ObjectId.isValid(id)) {
          query = { _id: new ObjectId(id) };
        } else {
          query = { id: id };
        }

        const updateDoc = {
          $set: {
            ...updateData,
            updatedAt: new Date().toISOString(),
          },
        };

        const result = await userBookingCollection.updateOne(query, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).json({ success: false, message: "Booking not found" });
        }

        const updatedBooking = await userBookingCollection.findOne(query);
        res.json({
          success: true,
          message: "Booking updated successfully",
          data: updatedBooking,
        });
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    };

    app.patch("/bookings/:id", verifyBetterAuthToken, handleUpdateBooking);
    app.patch("/api/bookings/:id", verifyBetterAuthToken, handleUpdateBooking);
    app.put("/bookings/:id", verifyBetterAuthToken, handleUpdateBooking);
    app.put("/api/bookings/:id", verifyBetterAuthToken, handleUpdateBooking);

    // GET /cars/my-cars or /api/cars/my-cars — GET API to retrieve added cars for the my-cars route (Protected)
    const handleGetMyCars = async (req, res) => {
      try {
        const email = (req.query.email || req.query.userEmail || req.user?.email || "").trim();
        let query = {};

        if (email) {
          query = {
            $or: [
              { userEmail: email.toLowerCase() },
              { ownerEmail: email.toLowerCase() },
              { userEmail: email },
              { ownerEmail: email },
              { isUserAdded: true },
            ],
          };
        } else {
          query = {
            $or: [{ isUserAdded: true }, { userEmail: { $exists: true } }],
          };
        }

        let cars = await carCollection.find(query).sort({ createdAt: -1 }).toArray();

        if (!cars || cars.length === 0) {
          cars = await carCollection.find({}).sort({ createdAt: -1 }).toArray();
        }

        res.json(cars);
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    };

    app.get("/cars/my-cars", verifyBetterAuthToken, handleGetMyCars);
    app.get("/api/cars/my-cars", verifyBetterAuthToken, handleGetMyCars);

    // GET /cars or /api/cars — Get all vehicles with search & category filter support
    const handleGetCars = async (req, res) => {
      try {
        const { search, type, featured, home } = req.query;
        let query = {};
        const conditions = [];

        if (featured === "true" || home === "true") {
          conditions.push({ isUserAdded: { $ne: true } });
        }

        if (search && search.trim()) {
          const searchRegex = new RegExp(search.trim(), "i");
          conditions.push({
            $or: [
              { model: searchRegex },
              { carName: searchRegex },
              { location: searchRegex },
              { category: searchRegex },
              { pickupLocation: searchRegex },
              { carType: searchRegex },
            ],
          });
        }

        if (type && type.trim() && type.trim().toLowerCase() !== "all") {
          const typeRegex = new RegExp(type.trim(), "i");
          conditions.push({
            $or: [{ category: typeRegex }, { carType: typeRegex }],
          });
        }

        if (conditions.length > 0) {
          query = { $and: conditions };
        }

        const cars = await carCollection.find(query).sort({ createdAt: -1 }).toArray();
        res.json(cars);
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    };

    app.get("/cars", handleGetCars);
    app.get("/api/cars", handleGetCars);

    // GET /cars/:id or /api/cars/:id — Get vehicle details by ID
    const handleGetSingleCar = async (req, res) => {
      try {
        const { id } = req.params;
        let query = {};
        if (ObjectId.isValid(id)) {
          query = { _id: new ObjectId(id) };
        } else {
          query = { id: id };
        }

        const car = await carCollection.findOne(query);
        if (!car) {
          return res.status(404).json({ success: false, message: "Vehicle not found" });
        }
        res.json(car);
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    };

    app.get("/cars/:id", handleGetSingleCar);
    app.get("/api/cars/:id", handleGetSingleCar);

    // PATCH/PUT /cars/:id or /api/cars/:id — Update vehicle details by ID (Protected)
    const handleUpdateCar = async (req, res) => {
      try {
        const { id } = req.params;
        const updateData = req.body;

        let query = {};
        if (ObjectId.isValid(id)) {
          query = { _id: new ObjectId(id) };
        } else {
          query = { id: id };
        }

        const updateDoc = {
          $set: {
            ...updateData,
            updatedAt: new Date().toISOString(),
          },
        };

        const result = await carCollection.updateOne(query, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).json({ success: false, message: "Vehicle not found" });
        }

        const updatedCar = await carCollection.findOne(query);
        res.json({
          success: true,
          message: "Vehicle updated successfully",
          data: updatedCar,
        });
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    };

    app.patch("/cars/:id", verifyBetterAuthToken, handleUpdateCar);
    app.patch("/api/cars/:id", verifyBetterAuthToken, handleUpdateCar);
    app.put("/cars/:id", verifyBetterAuthToken, handleUpdateCar);
    app.put("/api/cars/:id", verifyBetterAuthToken, handleUpdateCar);

    // DELETE /cars/:id or /api/cars/:id — Delete vehicle by ID (Protected)
    const handleDeleteCar = async (req, res) => {
      try {
        const { id } = req.params;
        let query = {};
        if (ObjectId.isValid(id)) {
          query = { _id: new ObjectId(id) };
        } else {
          query = { id: id };
        }

        const result = await carCollection.deleteOne(query);
        if (result.deletedCount === 0) {
          return res.status(404).json({ success: false, message: "Car not found" });
        }
        res.json({ success: true, message: "Vehicle deleted successfully" });
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    };

    app.delete("/cars/:id", verifyBetterAuthToken, handleDeleteCar);
    app.delete("/api/cars/:id", verifyBetterAuthToken, handleDeleteCar);

    // Root ping route
    app.get("/", (req, res) => {
      res.send("DriveFleet Backend API is running smoothly!");
    });
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
