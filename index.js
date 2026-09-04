const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

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
    await client.connect();
    console.log("Successfully connected to MongoDB!");

    const database = client.db("Drivefleet_Car_Platform");
    const carCollection = database.collection("car_info");

    // POST /cars or /api/cars — Create new vehicle
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

    app.post("/cars", handleAddCar);
    app.post("/api/cars", handleAddCar);

    // GET /cars or /api/cars — Get all vehicles
    const handleGetCars = async (req, res) => {
      try {
        const cars = await carCollection.find({}).toArray();
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
