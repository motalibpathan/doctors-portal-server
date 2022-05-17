const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;
var nodemailer = require("nodemailer");
var sgTransport = require("nodemailer-sendgrid-transport");

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hyb1n.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

const emailSenderOptions = {
  auth: {
    api_key: process.env.EMAIL_SENDER_KEY,
  },
};

const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));

function sendAppointmentEmail(booking) {
  const { patient, patientName, treatment, date, slot } = booking;

  const email = {
    from: process.env.EMAIL_SENDER,
    to: patient,
    subject: `Your appointment for ${treatment} is on ${date} at ${slot} is confirmed!`,
    text: `Your appointment for ${treatment} is on ${date} at ${slot} is confirmed!`,
    html: `<div>
      <h1>Hello ${patientName}</h1>
      <h3>Your Appointment for ${treatment}</h3>
      <p>Looking forward to seeing you on ${date}</p>
      <h3>Our Address</h3>
      <p>Andor Killa Bandorban</p>
      <p>Bangladesh</p>
      <a href="https://web.programming-hero.com/">unsubscribe</a>
    <div>`,
  };
  emailClient.sendMail(email, function (err, info) {
    if (err) {
      console.log(err);
    } else {
      console.log("message send: ", info);
    }
  });
}

async function run() {
  try {
    await client.connect();
    const servicesCollection = client
      .db("doctors_portal")
      .collection("services");
    const bookingCollection = client.db("doctors_portal").collection("booking");
    const userCollection = client.db("doctors_portal").collection("user");
    const doctorCollection = client.db("doctors_portal").collection("doctors");

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });

      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    };

    app.get("/services", async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query).project({ name: 1 });
      const services = await cursor.toArray();
      res.send(services);
    });

    app.get("/user", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };

      const updatedDoc = { $set: { role: "admin" } };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updatedDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1d" }
      );
      res.send({ result, token });
    });

    // warning
    // this is not a proper way to query
    // after learning more about mongodb use aggregate lookup, pipeline, match, group
    app.get("/available", async (req, res) => {
      const date = req.query.date;

      // step 1: get all services
      const services = await servicesCollection.find().toArray();

      // step 2: get the booking of the date output: [{},{},{},{},{},{},{},{}]
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      // step 3: for each service, find booking for that service
      services.forEach((service) => {
        // step 4: find booking for that service output: [{},{},{}, {}]
        const serviceBookings = bookings.filter(
          (book) => book.treatment === service.name
        );
        // step 5: select slots for the service booking: ["", "", "", ""]
        const bookedSlots = serviceBookings.map((book) => book.slot);
        // step 6: select those slots that are not in bookedSlots
        const available = service.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        // step 7: set available to slots to make it easier
        service.slots = available;
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
    app.get("/booking", verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        res.send(bookings);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });
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
      // console.log("sending email");
      // sendAppointmentEmail(booking);

      return res.send({ success: true, result });
    });

    app.get("/doctor", verifyJWT, verifyAdmin, async (req, res) => {
      const doctors = await doctorCollection.find().toArray();
      res.send(doctors);
    });

    app.post("/doctor", verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });

    app.delete("/doctor/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email };
      const result = await doctorCollection.deleteOne(filter);
      res.send(result);
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
