const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hyb1n.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    await client.connect();
    const servicesCollection = client
      .db("doctors_portal")
      .collection("services");
    const bookingCollection = client.db("doctors_portal").collection("booking");

    app.get("/services", async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    });

    // warning
    // this is not a proper way to query
    // after learning more about mongodb use aggregate lookup, pipeline, match, group
    app.get("/available", async (req, res) => {
      const date = req.query.date;

      // step 1: get all services
      const services = await servicesCollection.find().toArray();

      // step 2: get the booking of the date
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      // step 3: for each service, find booking for that service
      services.forEach((service) => {
        const serviceBookings = bookings.filter(
          (b) => b.treatment === service.name
        );
        const booked = serviceBookings.map((s) => s.slot);
        const available = service.slots.filter(
          (slot) => !booked.includes(slot)
        );
        service.available = available;
      });

      res.send(services);
    });

    // app.get('/available', async (req,res) => {

    //  })
    /**
     * API Naming convention
     * app.get('/booking') // get all bookings on this collection or get more than one or by filter query
     * app.get('/booking/:id') // specific booking
     * app.post('/booking') // add a new booking
     * app.patch('/booking/:id') //
     * app.delete('/booking/:id') //
     */

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
      };
      const exits = await bookingCollection.findOne(query);
      if (exits) {
        return res.send({ success: false, booking: exits });
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    });
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Doctors portal server running!");
});

app.listen(port, () => {
  console.log("Doctors portal server running on port ", port);
});
